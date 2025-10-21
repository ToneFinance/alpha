package main

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

type EventListener struct {
	client   *ethclient.Client
	config   *Config
	fulfiller *Fulfiller
	lastBlock uint64
}

func NewEventListener(client *ethclient.Client, config *Config, fulfiller *Fulfiller) *EventListener {
	return &EventListener{
		client:   client,
		config:   config,
		fulfiller: fulfiller,
		lastBlock: 0,
	}
}

func (l *EventListener) Start(ctx context.Context) error {
	// Get current block
	header, err := l.client.HeaderByNumber(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to get latest block: %v", err)
	}
	currentBlock := header.Number.Uint64()

	// Always scan for pending deposits on startup
	fmt.Printf("🔍 Checking for pending deposits...\n")
	if err := l.scanHistoricalDeposits(ctx); err != nil {
		fmt.Printf("⚠️  Warning: error scanning deposits: %v\n", err)
	}

	// Set lastBlock to current
	l.lastBlock = currentBlock

	fmt.Printf("🎯 Starting event listener from block %d\n", l.lastBlock)
	fmt.Printf("⏰ Polling every %d seconds\n\n", l.config.PollInterval)

	ticker := time.NewTicker(time.Duration(l.config.PollInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := l.poll(ctx); err != nil {
				fmt.Printf("❌ Error polling: %v\n", err)
			}
		}
	}
}

func (l *EventListener) poll(ctx context.Context) error {
	// Get current block
	header, err := l.client.HeaderByNumber(ctx, nil)
	if err != nil {
		return err
	}
	currentBlock := header.Number.Uint64()

	if currentBlock <= l.lastBlock {
		fmt.Printf("⏳ No new blocks (current: %d)\n", currentBlock)
		return nil
	}

	fmt.Printf("🔍 Checking blocks %d to %d\n", l.lastBlock+1, currentBlock)

	// Query for DepositRequested events
	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(l.lastBlock + 1),
		ToBlock:   new(big.Int).SetUint64(currentBlock),
		Addresses: []common.Address{l.config.SectorVault},
		Topics:    [][]common.Hash{{common.HexToHash("0x827893a5f98dbfaba92dbe0bb2cafe8b9fd5573711d9768ce5cd4e2af44601ac")}}, // DepositRequested(address,uint256,uint256,uint256)
	}

	logs, err := l.client.FilterLogs(ctx, query)
	if err != nil {
		return err
	}

	if len(logs) > 0 {
		fmt.Printf("📨 Found %d deposit event(s)\n", len(logs))
	}

	for _, vLog := range logs {
		if err := l.handleDepositEvent(ctx, vLog); err != nil {
			fmt.Printf("❌ Error handling deposit event: %v\n", err)
		}
	}

	l.lastBlock = currentBlock
	return nil
}

func (l *EventListener) handleDepositEvent(ctx context.Context, vLog types.Log) error {
	// Parse event
	// Topics: [0] = event signature, [1] = user (indexed), [2] = depositId (indexed)
	// Data: quoteAmount, timestamp

	if len(vLog.Topics) < 3 {
		return fmt.Errorf("invalid event topics")
	}

	depositId := new(big.Int).SetBytes(vLog.Topics[2].Bytes())

	// Parse data (quoteAmount and timestamp)
	if len(vLog.Data) < 64 {
		return fmt.Errorf("invalid event data")
	}

	quoteAmount := new(big.Int).SetBytes(vLog.Data[0:32])

	fmt.Printf("\n🆕 New deposit detected!\n")
	fmt.Printf("   Deposit ID: %s\n", depositId.String())
	fmt.Printf("   Quote Amount: %s\n", quoteAmount.String())
	fmt.Printf("   Block: %d\n", vLog.BlockNumber)
	fmt.Printf("   Tx: %s\n", vLog.TxHash.Hex())

	// Fulfill the deposit
	return l.fulfiller.FulfillDeposit(ctx, depositId, quoteAmount)
}

func (l *EventListener) scanHistoricalDeposits(ctx context.Context) error {
	// Get nextDepositId to know how many deposits exist
	nextDepositId, err := l.fulfiller.GetNextDepositId(ctx)
	if err != nil {
		return fmt.Errorf("failed to get nextDepositId: %v", err)
	}

	if nextDepositId.Cmp(big.NewInt(0)) == 0 {
		fmt.Printf("✓ No deposits found\n\n")
		return nil
	}

	fmt.Printf("📊 Found %s total deposit(s), checking status...\n", nextDepositId.String())

	unfulfilledCount := 0
	// Check each deposit
	for i := int64(0); i < nextDepositId.Int64(); i++ {
		depositId := big.NewInt(i)
		deposit, err := l.fulfiller.GetPendingDeposit(ctx, depositId)
		if err != nil {
			fmt.Printf("⚠️  Error checking deposit #%d: %v\n", i, err)
			continue
		}

		// Skip if already fulfilled
		if deposit.Fulfilled {
			continue
		}

		// Skip if quoteAmount is 0 (invalid deposit)
		if deposit.QuoteAmount.Cmp(big.NewInt(0)) == 0 {
			continue
		}

		unfulfilledCount++
		fmt.Printf("\n🔔 Found pending deposit #%d\n", i)
		fmt.Printf("   User: %s\n", deposit.User.Hex())
		fmt.Printf("   Quote Amount: %s\n", deposit.QuoteAmount.String())

		// Fulfill it
		if err := l.fulfiller.FulfillDeposit(ctx, depositId, deposit.QuoteAmount); err != nil {
			fmt.Printf("❌ Error fulfilling deposit #%d: %v\n", i, err)
		}
	}

	if unfulfilledCount == 0 {
		fmt.Printf("✓ All deposits are fulfilled\n\n")
	} else {
		fmt.Printf("\n✓ Fulfilled %d pending deposit(s)\n\n", unfulfilledCount)
	}

	return nil
}
