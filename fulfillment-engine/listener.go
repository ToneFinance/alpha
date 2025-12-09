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
	// WithdrawalRequested event signature: WithdrawalRequested(address indexed user, uint256 indexed withdrawalId, uint256 sharesAmount, uint256 timestamp)
	withdrawalRequestedSignature = "0x38e3d972947cfef94205163d483d6287ef27eb312e20cb8e0b13a49989db232e"
)

type EventListener struct {
	client      *ethclient.Client
	config      *Config
	vaultConfig VaultConfig
	fulfiller   *Fulfiller
	lastBlock   uint64
}

func NewEventListener(client *ethclient.Client, config *Config, vaultConfig VaultConfig, fulfiller *Fulfiller) *EventListener {
	return &EventListener{
		client:      client,
		config:      config,
		vaultConfig: vaultConfig,
		fulfiller:   fulfiller,
		lastBlock:   0,
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

	// Always scan for pending withdrawals on startup
	Logger.Info("Scanning for pending withdrawals on startup")
	if err := l.scanHistoricalWithdrawals(ctx); err != nil {
		Logger.Warn("Error scanning withdrawals", "error", err)
	}

	// Set lastBlock to current
	l.lastBlock = currentBlock

	Logger.Info("Event listener started",
		"vault_name", l.vaultConfig.Name,
		"vault_address", l.vaultConfig.Address.Hex(),
		"start_block", l.lastBlock,
		"poll_interval_seconds", l.config.PollInterval,
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

	// Query for both DepositRequested and WithdrawalRequested events
	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(l.lastBlock + 1),
		ToBlock:   new(big.Int).SetUint64(currentBlock),
		Addresses: []common.Address{l.vaultConfig.Address},
		Topics:    [][]common.Hash{{common.HexToHash(depositRequestedSignature), common.HexToHash(withdrawalRequestedSignature)}},
	}

	logs, err := l.client.FilterLogs(ctx, query)
	if err != nil {
		return err
	}

	if len(logs) > 0 {
		Logger.Info("Events detected", "event_count", len(logs))
	}

	for _, vLog := range logs {
		// Check which event it is based on the first topic (event signature)
		eventSig := vLog.Topics[0].Hex()

		if eventSig == depositRequestedSignature {
			if err := l.handleDepositEvent(ctx, vLog); err != nil {
				Logger.Error("Error handling deposit event",
					"block", vLog.BlockNumber,
					"tx_hash", vLog.TxHash.Hex(),
					"error", err,
				)
			}
		} else if eventSig == withdrawalRequestedSignature {
			if err := l.handleWithdrawalEvent(ctx, vLog); err != nil {
				Logger.Error("Error handling withdrawal event",
					"block", vLog.BlockNumber,
					"tx_hash", vLog.TxHash.Hex(),
					"error", err,
				)
			}
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

func (l *EventListener) handleWithdrawalEvent(ctx context.Context, vLog types.Log) error {
	// Parse event
	// Topics: [0] = event signature, [1] = user (indexed), [2] = withdrawalId (indexed)
	// Data: sharesAmount, timestamp

	if len(vLog.Topics) < 3 {
		return fmt.Errorf("invalid event topics")
	}

	withdrawalId := new(big.Int).SetBytes(vLog.Topics[2].Bytes())
	userAddress := common.BytesToAddress(vLog.Topics[1].Bytes())

	// Parse data (sharesAmount and timestamp)
	if len(vLog.Data) < 64 {
		return fmt.Errorf("invalid event data")
	}

	sharesAmount := new(big.Int).SetBytes(vLog.Data[0:32])

	Logger.Info("New withdrawal event received",
		"withdrawal_id", withdrawalId.String(),
		"user", userAddress.Hex(),
		"shares_amount", sharesAmount.String(),
		"block", vLog.BlockNumber,
		"tx_hash", vLog.TxHash.Hex(),
	)

	// Fulfill the withdrawal
	return l.fulfiller.FulfillWithdrawal(ctx, withdrawalId, sharesAmount)
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

func (l *EventListener) scanHistoricalWithdrawals(ctx context.Context) error {
	// Get nextWithdrawalId to know how many withdrawals exist
	nextWithdrawalId, err := l.fulfiller.GetNextWithdrawalId(ctx)
	if err != nil {
		return fmt.Errorf("failed to get nextWithdrawalId: %v", err)
	}

	if nextWithdrawalId.Cmp(big.NewInt(0)) == 0 {
		Logger.Info("No historical withdrawals found")
		return nil
	}

	Logger.Info("Scanning historical withdrawals",
		"total_withdrawals", nextWithdrawalId.String(),
	)

	unfulfilledCount := 0
	// Check each withdrawal
	for i := int64(0); i < nextWithdrawalId.Int64(); i++ {
		withdrawalId := big.NewInt(i)
		withdrawal, err := l.fulfiller.GetPendingWithdrawal(ctx, withdrawalId)
		if err != nil {
			Logger.Warn("Error checking withdrawal status",
				"withdrawal_id", i,
				"error", err,
			)
			continue
		}

		// Skip if already fulfilled
		if withdrawal.Fulfilled {
			continue
		}

		// Skip if sharesAmount is 0 (invalid withdrawal)
		if withdrawal.SharesAmount.Cmp(big.NewInt(0)) == 0 {
			continue
		}

		unfulfilledCount++
		Logger.Info("Found pending withdrawal",
			"withdrawal_id", i,
			"user", withdrawal.User.Hex(),
			"shares_amount", withdrawal.SharesAmount.String(),
		)

		// Fulfill it
		if err := l.fulfiller.FulfillWithdrawal(ctx, withdrawalId, withdrawal.SharesAmount); err != nil {
			Logger.Error("Failed to fulfill historical withdrawal",
				"withdrawal_id", i,
				"error", err,
			)
		}
	}

	if unfulfilledCount == 0 {
		Logger.Info("All historical withdrawals already fulfilled")
	} else {
		Logger.Info("Historical withdrawal scan completed",
			"fulfilled_count", unfulfilledCount,
		)
	}

	return nil
}
