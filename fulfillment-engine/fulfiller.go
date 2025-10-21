package main

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

type Fulfiller struct {
	client       *ethclient.Client
	config       *Config
	privateKey   *ecdsa.PrivateKey
	fromAddress  common.Address
	nonce        *uint64 // Track nonce manually
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

	fmt.Printf("✅ Fulfillment engine initialized\n")
	fmt.Printf("📍 Fulfiller address: %s\n", fromAddress.Hex())
	fmt.Printf("🏦 Vault address: %s\n", config.SectorVault.Hex())

	return &Fulfiller{
		client:      client,
		config:      config,
		privateKey:  privateKey,
		fromAddress: fromAddress,
		nonce:       nil, // Will be fetched on first transaction
	}, nil
}

func (f *Fulfiller) FulfillDeposit(ctx context.Context, depositId *big.Int, quoteAmount *big.Int) error {
	fmt.Printf("\n🔄 Fulfilling deposit #%s\n", depositId.String())
	fmt.Printf("💵 Quote amount: %s\n", quoteAmount.String())

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

	fmt.Printf("📊 Underlying amounts:\n")
	fmt.Printf("  - WETH: %s\n", wethAmount.String())
	fmt.Printf("  - UNI:  %s\n", uniAmount.String())
	fmt.Printf("  - AAVE: %s\n", aaveAmount.String())

	// Approve tokens
	if err := f.approveToken(ctx, f.config.WETH, wethAmount); err != nil {
		return fmt.Errorf("failed to approve WETH: %v", err)
	}
	if err := f.approveToken(ctx, f.config.UNI, uniAmount); err != nil {
		return fmt.Errorf("failed to approve UNI: %v", err)
	}
	if err := f.approveToken(ctx, f.config.AAVE, aaveAmount); err != nil {
		return fmt.Errorf("failed to approve AAVE: %v", err)
	}

	// Call fulfillDeposit
	underlyingAmounts := []*big.Int{wethAmount, uniAmount, aaveAmount}
	if err := f.callFulfillDeposit(ctx, depositId, underlyingAmounts); err != nil {
		return fmt.Errorf("failed to call fulfillDeposit: %v", err)
	}

	fmt.Printf("✅ Deposit #%s fulfilled successfully!\n", depositId.String())
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

	fmt.Printf("  ⏳ Approving %s: %s\n", token.Hex()[:8]+"...", tx.Hash().Hex())

	// Wait for transaction to be mined
	if err := f.waitForTransaction(ctx, tx); err != nil {
		return err
	}

	fmt.Printf("  ✓ Approved %s\n", token.Hex()[:8]+"...")
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

	fmt.Printf("  ⏳ Fulfilling deposit: %s\n", tx.Hash().Hex())

	// Wait for transaction to be mined
	if err := f.waitForTransaction(ctx, tx); err != nil {
		return err
	}

	fmt.Printf("  ✓ Deposit fulfilled!\n")
	return nil
}

func (f *Fulfiller) sendTransaction(ctx context.Context, to common.Address, value *big.Int, data []byte) (*types.Transaction, error) {
	// Get or fetch nonce
	var nonce uint64
	if f.nonce == nil {
		// First transaction - fetch nonce from network
		fetchedNonce, err := f.client.PendingNonceAt(ctx, f.fromAddress)
		if err != nil {
			return nil, err
		}
		nonce = fetchedNonce
		f.nonce = &nonce
	} else {
		// Use tracked nonce
		nonce = *f.nonce
	}

	gasPrice, err := f.client.SuggestGasPrice(ctx)
	if err != nil {
		return nil, err
	}

	chainID, err := f.client.NetworkID(ctx)
	if err != nil {
		return nil, err
	}

	tx := types.NewTransaction(nonce, to, value, 300000, gasPrice, data)

	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), f.privateKey)
	if err != nil {
		return nil, err
	}

	err = f.client.SendTransaction(ctx, signedTx)
	if err != nil {
		// Check if it's a nonce error - reset nonce tracker to resync
		if strings.Contains(err.Error(), "nonce too low") || strings.Contains(err.Error(), "replacement transaction underpriced") {
			f.nonce = nil // Reset to force fresh fetch on next transaction
		}
		return nil, err
	}

	// Increment nonce for next transaction
	next := nonce + 1
	f.nonce = &next

	return signedTx, nil
}

func (f *Fulfiller) waitForTransaction(ctx context.Context, tx *types.Transaction) error {
	// Wait for transaction to be mined (with simple polling)
	for i := 0; i < 60; i++ { // Wait up to 60 seconds
		receipt, err := f.client.TransactionReceipt(ctx, tx.Hash())
		if err == nil && receipt != nil {
			if receipt.Status == 0 {
				return fmt.Errorf("transaction reverted")
			}
			// Transaction successful - add small delay to ensure node state updates
			time.Sleep(2 * time.Second)
			return nil
		}

		// Transaction not yet mined, wait and retry
		time.Sleep(1 * time.Second)
	}

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

func (f *Fulfiller) Close() {
	f.client.Close()
}
