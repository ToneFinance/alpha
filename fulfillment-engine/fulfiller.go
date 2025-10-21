package main

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const (
	// Transaction wait timeout in seconds
	txWaitTimeout = 60
	// Post-transaction state sync delay
	txSyncDelay = 2 * time.Second
)

type Fulfiller struct {
	client      *ethclient.Client
	config      *Config
	privateKey  *ecdsa.PrivateKey
	fromAddress common.Address
	nonce       *uint64        // Track nonce manually
	wg          sync.WaitGroup // Track in-flight fulfillments
	mu          sync.Mutex     // Protect nonce access
}

func NewFulfiller(config *Config) (*Fulfiller, error) {
	client, err := ethclient.Dial(config.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to ethereum client: %v", err)
	}

	privateKey, err := crypto.HexToECDSA(config.PrivateKey[2:]) // Remove 0x prefix
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %v", err)
	}

	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("cannot assert type: publicKey is not of type *ecdsa.PublicKey")
	}

	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)

	Logger.Info("Fulfillment engine initialized",
		"fulfiller_address", fromAddress.Hex(),
		"vault_address", config.SectorVault.Hex(),
		"rpc_url", config.RPCURL,
	)

	return &Fulfiller{
		client:      client,
		config:      config,
		privateKey:  privateKey,
		fromAddress: fromAddress,
		nonce:       nil, // Will be fetched on first transaction
	}, nil
}

func (f *Fulfiller) FulfillDeposit(ctx context.Context, depositId *big.Int, quoteAmount *big.Int) error {
	// Track this in-flight operation
	f.wg.Add(1)
	defer f.wg.Done()

	// Check if context is already cancelled before starting
	select {
	case <-ctx.Done():
		Logger.Info("Deposit fulfillment cancelled before start",
			"deposit_id", depositId.String(),
			"reason", ctx.Err(),
		)
		return ctx.Err()
	default:
	}

	Logger.Info("Starting deposit fulfillment",
		"deposit_id", depositId.String(),
		"quote_amount", quoteAmount.String(),
	)

	// Calculate underlying amounts based on weights
	// Weights: 33.33% WETH, 33.33% UNI, 33.34% AAVE
	// For simplicity, we'll use the quote amount as the basis
	wethAmount := new(big.Int).Div(new(big.Int).Mul(quoteAmount, big.NewInt(3333)), big.NewInt(10000))
	uniAmount := new(big.Int).Div(new(big.Int).Mul(quoteAmount, big.NewInt(3333)), big.NewInt(10000))
	aaveAmount := new(big.Int).Div(new(big.Int).Mul(quoteAmount, big.NewInt(3334)), big.NewInt(10000))

	// Convert to 18 decimals (underlying tokens have 18 decimals, USDC has 6)
	wethAmount = new(big.Int).Mul(wethAmount, new(big.Int).Exp(big.NewInt(10), big.NewInt(12), nil))
	uniAmount = new(big.Int).Mul(uniAmount, new(big.Int).Exp(big.NewInt(10), big.NewInt(12), nil))
	aaveAmount = new(big.Int).Mul(aaveAmount, new(big.Int).Exp(big.NewInt(10), big.NewInt(12), nil))

	Logger.Debug("Calculated underlying token amounts",
		"deposit_id", depositId.String(),
		"weth_amount", wethAmount.String(),
		"uni_amount", uniAmount.String(),
		"aave_amount", aaveAmount.String(),
	)

	// Approve tokens
	if err := f.approveToken(ctx, f.config.WETH, wethAmount); err != nil {
		Logger.Error("Failed to approve WETH",
			"deposit_id", depositId.String(),
			"token", f.config.WETH.Hex(),
			"amount", wethAmount.String(),
			"error", err,
		)
		return fmt.Errorf("failed to approve WETH: %v", err)
	}
	if err := f.approveToken(ctx, f.config.UNI, uniAmount); err != nil {
		Logger.Error("Failed to approve UNI",
			"deposit_id", depositId.String(),
			"token", f.config.UNI.Hex(),
			"amount", uniAmount.String(),
			"error", err,
		)
		return fmt.Errorf("failed to approve UNI: %v", err)
	}
	if err := f.approveToken(ctx, f.config.AAVE, aaveAmount); err != nil {
		Logger.Error("Failed to approve AAVE",
			"deposit_id", depositId.String(),
			"token", f.config.AAVE.Hex(),
			"amount", aaveAmount.String(),
			"error", err,
		)
		return fmt.Errorf("failed to approve AAVE: %v", err)
	}

	// Call fulfillDeposit
	underlyingAmounts := []*big.Int{wethAmount, uniAmount, aaveAmount}
	if err := f.callFulfillDeposit(ctx, depositId, underlyingAmounts); err != nil {
		Logger.Error("Failed to fulfill deposit",
			"deposit_id", depositId.String(),
			"error", err,
		)
		return fmt.Errorf("failed to call fulfillDeposit: %v", err)
	}

	Logger.Info("Deposit fulfilled successfully",
		"deposit_id", depositId.String(),
		"quote_amount", quoteAmount.String(),
	)
	return nil
}

func (f *Fulfiller) approveToken(ctx context.Context, token common.Address, amount *big.Int) error {
	parsedABI, _ := ParseERC20ABI()

	data, err := parsedABI.Pack("approve", f.config.SectorVault, amount)
	if err != nil {
		return err
	}

	tx, err := f.sendTransaction(ctx, token, big.NewInt(0), data)
	if err != nil {
		return err
	}

	Logger.Info("Token approval transaction sent",
		"token", token.Hex(),
		"amount", amount.String(),
		"tx_hash", tx.Hash().Hex(),
	)

	// Wait for transaction to be mined
	if err := f.waitForTransaction(ctx, tx); err != nil {
		Logger.Error("Token approval transaction failed",
			"token", token.Hex(),
			"tx_hash", tx.Hash().Hex(),
			"error", err,
		)
		return err
	}

	Logger.Debug("Token approval confirmed",
		"token", token.Hex(),
		"tx_hash", tx.Hash().Hex(),
	)
	return nil
}

func (f *Fulfiller) callFulfillDeposit(ctx context.Context, depositId *big.Int, amounts []*big.Int) error {
	parsedABI, _ := ParseSectorVaultABI()

	data, err := parsedABI.Pack("fulfillDeposit", depositId, amounts)
	if err != nil {
		return err
	}

	tx, err := f.sendTransaction(ctx, f.config.SectorVault, big.NewInt(0), data)
	if err != nil {
		return err
	}

	Logger.Info("Fulfill deposit transaction sent",
		"deposit_id", depositId.String(),
		"tx_hash", tx.Hash().Hex(),
	)

	// Wait for transaction to be mined
	if err := f.waitForTransaction(ctx, tx); err != nil {
		Logger.Error("Fulfill deposit transaction failed",
			"deposit_id", depositId.String(),
			"tx_hash", tx.Hash().Hex(),
			"error", err,
		)
		return err
	}

	Logger.Debug("Fulfill deposit transaction confirmed",
		"deposit_id", depositId.String(),
		"tx_hash", tx.Hash().Hex(),
	)
	return nil
}

func (f *Fulfiller) sendTransaction(ctx context.Context, to common.Address, value *big.Int, data []byte) (*types.Transaction, error) {
	// Get or fetch nonce (with mutex protection)
	f.mu.Lock()
	var nonce uint64
	if f.nonce == nil {
		// First transaction - fetch nonce from network
		f.mu.Unlock() // Unlock while making network call
		fetchedNonce, err := f.client.PendingNonceAt(ctx, f.fromAddress)
		if err != nil {
			Logger.Error("Failed to fetch nonce", "error", err)
			return nil, err
		}
		f.mu.Lock() // Re-lock to update nonce
		nonce = fetchedNonce
		f.nonce = &nonce
		Logger.Debug("Fetched initial nonce", "nonce", nonce)
	} else {
		// Use tracked nonce
		nonce = *f.nonce
	}
	f.mu.Unlock()

	gasPrice, err := f.client.SuggestGasPrice(ctx)
	if err != nil {
		Logger.Error("Failed to get gas price", "error", err)
		return nil, err
	}

	chainID, err := f.client.NetworkID(ctx)
	if err != nil {
		Logger.Error("Failed to get network ID", "error", err)
		return nil, err
	}

	tx := types.NewTransaction(nonce, to, value, 300000, gasPrice, data)

	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), f.privateKey)
	if err != nil {
		Logger.Error("Failed to sign transaction", "error", err)
		return nil, err
	}

	err = f.client.SendTransaction(ctx, signedTx)
	if err != nil {
		// Check if it's a nonce error - reset nonce tracker to resync
		if strings.Contains(err.Error(), "nonce too low") || strings.Contains(err.Error(), "replacement transaction underpriced") {
			Logger.Warn("Nonce error detected, resetting nonce tracker",
				"error", err,
				"nonce", nonce,
			)
			f.mu.Lock()
			f.nonce = nil // Reset to force fresh fetch on next transaction
			f.mu.Unlock()
		}
		return nil, err
	}

	// Increment nonce for next transaction
	f.mu.Lock()
	next := nonce + 1
	f.nonce = &next
	f.mu.Unlock()

	Logger.Debug("Transaction sent",
		"tx_hash", signedTx.Hash().Hex(),
		"to", to.Hex(),
		"nonce", nonce,
		"gas_price", gasPrice.String(),
	)

	return signedTx, nil
}

func (f *Fulfiller) waitForTransaction(ctx context.Context, tx *types.Transaction) error {
	// Wait for transaction to be mined (with simple polling)
	for i := 0; i < txWaitTimeout; i++ {
		receipt, err := f.client.TransactionReceipt(ctx, tx.Hash())
		if err == nil && receipt != nil {
			if receipt.Status == 0 {
				Logger.Error("Transaction reverted",
					"tx_hash", tx.Hash().Hex(),
					"block", receipt.BlockNumber.Uint64(),
				)
				return fmt.Errorf("transaction reverted")
			}
			// Transaction successful - add small delay to ensure node state updates
			Logger.Debug("Transaction mined successfully",
				"tx_hash", tx.Hash().Hex(),
				"block", receipt.BlockNumber.Uint64(),
				"gas_used", receipt.GasUsed,
			)
			time.Sleep(txSyncDelay)
			return nil
		}

		// Transaction not yet mined, wait and retry
		time.Sleep(1 * time.Second)
	}

	Logger.Error("Transaction timeout",
		"tx_hash", tx.Hash().Hex(),
		"timeout_seconds", txWaitTimeout,
	)
	return fmt.Errorf("transaction not mined within timeout")
}

func (f *Fulfiller) GetNextDepositId(ctx context.Context) (*big.Int, error) {
	parsedABI, _ := ParseSectorVaultABI()

	data, err := parsedABI.Pack("nextDepositId")
	if err != nil {
		return nil, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.config.SectorVault,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var nextDepositId *big.Int
	err = parsedABI.UnpackIntoInterface(&nextDepositId, "nextDepositId", result)
	if err != nil {
		return nil, err
	}

	return nextDepositId, nil
}

func (f *Fulfiller) GetPendingDeposit(ctx context.Context, depositId *big.Int) (*PendingDeposit, error) {
	parsedABI, _ := ParseSectorVaultABI()

	data, err := parsedABI.Pack("pendingDeposits", depositId)
	if err != nil {
		return nil, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.config.SectorVault,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var deposit PendingDeposit
	err = parsedABI.UnpackIntoInterface(&[]interface{}{
		&deposit.User,
		&deposit.QuoteAmount,
		&deposit.Fulfilled,
		&deposit.Timestamp,
	}, "pendingDeposits", result)
	if err != nil {
		return nil, err
	}

	return &deposit, nil
}

// Wait waits for all in-flight fulfillments to complete
func (f *Fulfiller) Wait() {
	f.wg.Wait()
}

func (f *Fulfiller) Close() {
	f.client.Close()
}
