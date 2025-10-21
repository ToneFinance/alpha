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

const (
	// DepositRequested event signature
	depositRequestedSignature = "0x827893a5f98dbfaba92dbe0bb2cafe8b9fd5573711d9768ce5cd4e2af44601ac"
)

type EventListener struct {
	client    *ethclient.Client
	config    *Config
	fulfiller *Fulfiller
	lastBlock uint64
}

func NewEventListener(client *ethclient.Client, config *Config, fulfiller *Fulfiller) *EventListener {
	return &EventListener{
		client:    client,
		config:    config,
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
	Logger.Info("Scanning for pending deposits on startup")
	if err := l.scanHistoricalDeposits(ctx); err != nil {
		Logger.Warn("Error scanning deposits", "error", err)
	}

	// Set lastBlock to current
	l.lastBlock = currentBlock

	Logger.Info("Event listener started",
		"start_block", l.lastBlock,
		"poll_interval_seconds", l.config.PollInterval,
		"vault_address", l.config.SectorVault.Hex(),
	)

	ticker := time.NewTicker(time.Duration(l.config.PollInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := l.poll(ctx); err != nil {
				Logger.Error("Polling error", "error", err)
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
		Logger.Debug("No new blocks", "current_block", currentBlock)
		return nil
	}

	Logger.Debug("Checking block range for events",
		"from_block", l.lastBlock+1,
		"to_block", currentBlock,
	)

	// Query for DepositRequested events
	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(l.lastBlock + 1),
		ToBlock:   new(big.Int).SetUint64(currentBlock),
		Addresses: []common.Address{l.config.SectorVault},
		Topics:    [][]common.Hash{{common.HexToHash(depositRequestedSignature)}},
	}

	logs, err := l.client.FilterLogs(ctx, query)
	if err != nil {
		return err
	}

	if len(logs) > 0 {
		Logger.Info("Deposit events detected", "event_count", len(logs))
	}

	for _, vLog := range logs {
		if err := l.handleDepositEvent(ctx, vLog); err != nil {
			Logger.Error("Error handling deposit event",
				"block", vLog.BlockNumber,
				"tx_hash", vLog.TxHash.Hex(),
				"error", err,
			)
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
	userAddress := common.BytesToAddress(vLog.Topics[1].Bytes())

	// Parse data (quoteAmount and timestamp)
	if len(vLog.Data) < 64 {
		return fmt.Errorf("invalid event data")
	}

	quoteAmount := new(big.Int).SetBytes(vLog.Data[0:32])

	Logger.Info("New deposit event received",
		"deposit_id", depositId.String(),
		"user", userAddress.Hex(),
		"quote_amount", quoteAmount.String(),
		"block", vLog.BlockNumber,
		"tx_hash", vLog.TxHash.Hex(),
	)

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
		Logger.Info("No historical deposits found")
		return nil
	}

	Logger.Info("Scanning historical deposits",
		"total_deposits", nextDepositId.String(),
	)

	unfulfilledCount := 0
	// Check each deposit
	for i := int64(0); i < nextDepositId.Int64(); i++ {
		depositId := big.NewInt(i)
		deposit, err := l.fulfiller.GetPendingDeposit(ctx, depositId)
		if err != nil {
			Logger.Warn("Error checking deposit status",
				"deposit_id", i,
				"error", err,
			)
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
		Logger.Info("Found pending deposit",
			"deposit_id", i,
			"user", deposit.User.Hex(),
			"quote_amount", deposit.QuoteAmount.String(),
		)

		// Fulfill it
		if err := l.fulfiller.FulfillDeposit(ctx, depositId, deposit.QuoteAmount); err != nil {
			Logger.Error("Failed to fulfill historical deposit",
				"deposit_id", i,
				"error", err,
			)
		}
	}

	if unfulfilledCount == 0 {
		Logger.Info("All historical deposits already fulfilled")
	} else {
		Logger.Info("Historical deposit scan completed",
			"fulfilled_count", unfulfilledCount,
		)
	}

	return nil
}
