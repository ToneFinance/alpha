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
	client            *ethclient.Client
	config            *Config
	privateKey        *ecdsa.PrivateKey
	fromAddress       common.Address
	nonce             *uint64                  // Track nonce manually
	wg                sync.WaitGroup           // Track in-flight fulfillments
	mu                sync.Mutex               // Protect nonce access
	underlyingTokens  []common.Address         // Cached underlying tokens
	underlyingWeights []*big.Int               // Cached underlying weights
	approvedTokens    map[common.Address]bool  // Track which tokens have max approval
	oracleAddress     common.Address           // Oracle contract address
	oracleDecimals    uint8                    // Oracle price decimals
	quoteTokenAddress common.Address           // Quote token (e.g., USDC) address
	quoteDecimals     uint8                    // Quote token decimals
	tokenDecimals     map[common.Address]uint8 // Underlying token decimals
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

	fulfiller := &Fulfiller{
		client:         client,
		config:         config,
		privateKey:     privateKey,
		fromAddress:    fromAddress,
		nonce:          nil, // Will be fetched on first transaction
		approvedTokens: make(map[common.Address]bool),
		tokenDecimals:  make(map[common.Address]uint8),
	}

	ctx := context.Background()

	// Fetch oracle address from vault
	oracleAddr, err := fulfiller.getOracleAddress(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get oracle address: %v", err)
	}
	fulfiller.oracleAddress = oracleAddr

	// Fetch oracle decimals
	oracleDecimals, err := fulfiller.getOracleDecimals(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get oracle decimals: %v", err)
	}
	fulfiller.oracleDecimals = oracleDecimals

	// Fetch quote token address from vault
	quoteTokenAddr, err := fulfiller.getQuoteTokenAddress(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get quote token address: %v", err)
	}
	fulfiller.quoteTokenAddress = quoteTokenAddr

	// Fetch quote token decimals
	quoteDecimals, err := fulfiller.getTokenDecimals(ctx, quoteTokenAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to get quote token decimals: %v", err)
	}
	fulfiller.quoteDecimals = quoteDecimals

	// Fetch underlying tokens and weights from vault
	if err := fulfiller.loadUnderlyingTokens(ctx); err != nil {
		return nil, fmt.Errorf("failed to load underlying tokens: %v", err)
	}

	// Fetch decimals for all underlying tokens
	for _, token := range fulfiller.underlyingTokens {
		decimals, err := fulfiller.getTokenDecimals(ctx, token)
		if err != nil {
			return nil, fmt.Errorf("failed to get decimals for token %s: %v", token.Hex(), err)
		}
		fulfiller.tokenDecimals[token] = decimals
	}

	Logger.Info("Fulfillment engine initialized",
		"fulfiller_address", fromAddress.Hex(),
		"vault_address", config.SectorVault.Hex(),
		"oracle_address", oracleAddr.Hex(),
		"oracle_decimals", oracleDecimals,
		"quote_token", quoteTokenAddr.Hex(),
		"quote_decimals", quoteDecimals,
		"rpc_url", config.RPCURL,
		"underlying_tokens", len(fulfiller.underlyingTokens),
	)

	return fulfiller, nil
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

	// Fetch token prices from oracle
	tokenPrices := make([]*big.Int, len(f.underlyingTokens))
	for i, token := range f.underlyingTokens {
		price, err := f.getTokenPrice(ctx, token)
		if err != nil {
			Logger.Error("Failed to get token price",
				"deposit_id", depositId.String(),
				"token_index", i,
				"token", token.Hex(),
				"error", err,
			)
			return fmt.Errorf("failed to get price for token %s: %v", token.Hex(), err)
		}
		tokenPrices[i] = price

		Logger.Debug("Fetched token price",
			"deposit_id", depositId.String(),
			"token_index", i,
			"token", token.Hex(),
			"price", price.String(),
		)
	}

	// Calculate underlying amounts based on weights AND prices (with dynamic decimals)
	// For each token: calculate value allocation, then divide by price to get token amount
	totalWeight := big.NewInt(0)
	for _, weight := range f.underlyingWeights {
		totalWeight = new(big.Int).Add(totalWeight, weight)
	}

	underlyingAmounts := make([]*big.Int, len(f.underlyingTokens))

	for i, weight := range f.underlyingWeights {
		token := f.underlyingTokens[i]
		tokenDec := f.tokenDecimals[token]

		// Step 1: Calculate value allocation (in quote token decimals)
		// valueAllocation = quoteAmount * weight / totalWeight
		valueAllocation := new(big.Int).Div(new(big.Int).Mul(quoteAmount, weight), totalWeight)

		// Step 2: Convert value allocation from quote decimals to oracle decimals
		// This normalizes the value for price comparison
		var normalizedValue *big.Int
		if f.quoteDecimals >= f.oracleDecimals {
			// Scale down
			divisor := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(f.quoteDecimals-f.oracleDecimals)), nil)
			normalizedValue = new(big.Int).Div(valueAllocation, divisor)
		} else {
			// Scale up
			multiplier := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(f.oracleDecimals-f.quoteDecimals)), nil)
			normalizedValue = new(big.Int).Mul(valueAllocation, multiplier)
		}

		// Step 3: Calculate token amount: (normalizedValue * 10^tokenDecimals) / price
		// This converts the value (in oracle decimals) to token amount (in token decimals)
		tokenDecMultiplier := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(tokenDec)), nil)
		amount := new(big.Int).Div(new(big.Int).Mul(normalizedValue, tokenDecMultiplier), tokenPrices[i])
		underlyingAmounts[i] = amount

		Logger.Debug("Calculated underlying token amount",
			"deposit_id", depositId.String(),
			"token_index", i,
			"token", token.Hex(),
			"token_decimals", tokenDec,
			"weight", weight.String(),
			"price", tokenPrices[i].String(),
			"value_allocation", valueAllocation.String(),
			"normalized_value", normalizedValue.String(),
			"amount", amount.String(),
		)
	}

	// Ensure all tokens have max approval (only approves once per token)
	for i, token := range f.underlyingTokens {
		if err := f.ensureTokenApproval(ctx, token); err != nil {
			Logger.Error("Failed to ensure token approval",
				"deposit_id", depositId.String(),
				"token_index", i,
				"token", token.Hex(),
				"error", err,
			)
			return fmt.Errorf("failed to ensure approval for token %s: %v", token.Hex(), err)
		}
	}
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

// ensureTokenApproval ensures a token has max approval, only approving once per token
func (f *Fulfiller) ensureTokenApproval(ctx context.Context, token common.Address) error {
	// Check if already approved in memory
	f.mu.Lock()
	if f.approvedTokens[token] {
		f.mu.Unlock()
		return nil
	}
	f.mu.Unlock()

	// Check on-chain allowance
	allowance, err := f.getAllowance(ctx, token)
	if err != nil {
		Logger.Warn("Failed to check allowance, will attempt approval anyway",
			"token", token.Hex(),
			"error", err,
		)
	} else {
		// If allowance is already very high (e.g., > 10^70), skip approval
		minAllowance := new(big.Int)
		minAllowance.SetString("1000000000000000000000000000000000000000000000000000000000000000000000", 10) // 10^70

		if allowance.Cmp(minAllowance) >= 0 {
			Logger.Info("Token already has sufficient allowance, skipping approval",
				"token", token.Hex(),
				"allowance", allowance.String(),
			)
			// Mark as approved
			f.mu.Lock()
			f.approvedTokens[token] = true
			f.mu.Unlock()
			return nil
		}

		Logger.Info("Current allowance insufficient, approving max amount",
			"token", token.Hex(),
			"current_allowance", allowance.String(),
		)
	}

	// Approve max uint256 amount
	maxUint256 := new(big.Int)
	maxUint256.SetString("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16)

	parsedABI, _ := ParseERC20ABI()
	data, err := parsedABI.Pack("approve", f.config.SectorVault, maxUint256)
	if err != nil {
		return err
	}

	tx, err := f.sendTransaction(ctx, token, big.NewInt(0), data)
	if err != nil {
		return err
	}

	Logger.Info("Max approval transaction sent",
		"token", token.Hex(),
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

	// Mark as approved
	f.mu.Lock()
	f.approvedTokens[token] = true
	f.mu.Unlock()

	Logger.Info("Max approval confirmed",
		"token", token.Hex(),
		"tx_hash", tx.Hash().Hex(),
	)
	return nil
}

// getAllowance checks the on-chain allowance for a token
func (f *Fulfiller) getAllowance(ctx context.Context, token common.Address) (*big.Int, error) {
	parsedABI, err := ParseERC20ABI()
	if err != nil {
		return nil, err
	}

	data, err := parsedABI.Pack("allowance", f.fromAddress, f.config.SectorVault)
	if err != nil {
		return nil, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &token,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var allowance *big.Int
	err = parsedABI.UnpackIntoInterface(&allowance, "allowance", result)
	if err != nil {
		return nil, err
	}

	return allowance, nil
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

	tx := types.NewTransaction(nonce, to, value, 8000000, gasPrice, data)

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

// loadUnderlyingTokens fetches underlying tokens and weights from the vault
func (f *Fulfiller) loadUnderlyingTokens(ctx context.Context) error {
	parsedABI, err := ParseSectorVaultABI()
	if err != nil {
		return err
	}

	// Fetch tokens by index until we get an error (end of array)
	var tokens []common.Address
	var weights []*big.Int

	for i := uint64(0); ; i++ {
		// Try to fetch token at index i
		tokenData, err := parsedABI.Pack("underlyingTokens", new(big.Int).SetUint64(i))
		if err != nil {
			return err
		}

		tokenResult, err := f.client.CallContract(ctx, ethereum.CallMsg{
			To:   &f.config.SectorVault,
			Data: tokenData,
		}, nil)
		if err != nil {
			// End of array reached
			break
		}

		var token common.Address
		err = parsedABI.UnpackIntoInterface(&token, "underlyingTokens", tokenResult)
		if err != nil {
			break
		}

		// Check for zero address (end of valid tokens)
		if token == (common.Address{}) {
			break
		}

		tokens = append(tokens, token)

		// Fetch weight for this token
		weightData, err := parsedABI.Pack("targetWeights", token)
		if err != nil {
			return fmt.Errorf("failed to pack targetWeights for token %s: %v", token.Hex(), err)
		}

		weightResult, err := f.client.CallContract(ctx, ethereum.CallMsg{
			To:   &f.config.SectorVault,
			Data: weightData,
		}, nil)
		if err != nil {
			return fmt.Errorf("failed to call targetWeights for token %s: %v", token.Hex(), err)
		}

		var weight *big.Int
		err = parsedABI.UnpackIntoInterface(&weight, "targetWeights", weightResult)
		if err != nil {
			return fmt.Errorf("failed to unpack targetWeights for token %s: %v", token.Hex(), err)
		}

		weights = append(weights, weight)
	}

	if len(tokens) == 0 {
		return fmt.Errorf("no underlying tokens found in vault")
	}

	f.underlyingTokens = tokens
	f.underlyingWeights = weights

	Logger.Info("Loaded underlying tokens from vault",
		"token_count", len(tokens),
	)
	for i, token := range tokens {
		Logger.Debug("Underlying token",
			"index", i,
			"address", token.Hex(),
			"weight", weights[i].String(),
		)
	}

	return nil
}

// getOracleAddress fetches the oracle address from the vault
func (f *Fulfiller) getOracleAddress(ctx context.Context) (common.Address, error) {
	parsedABI, err := ParseSectorVaultABI()
	if err != nil {
		return common.Address{}, err
	}

	data, err := parsedABI.Pack("oracle")
	if err != nil {
		return common.Address{}, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.config.SectorVault,
		Data: data,
	}, nil)
	if err != nil {
		return common.Address{}, err
	}

	var oracleAddr common.Address
	err = parsedABI.UnpackIntoInterface(&oracleAddr, "oracle", result)
	if err != nil {
		return common.Address{}, err
	}

	return oracleAddr, nil
}

// getTokenPrice fetches the price of a token from the oracle (returns price with oracle decimals)
func (f *Fulfiller) getTokenPrice(ctx context.Context, token common.Address) (*big.Int, error) {
	parsedABI, err := ParseOracleABI()
	if err != nil {
		return nil, err
	}

	data, err := parsedABI.Pack("getPrice", token)
	if err != nil {
		return nil, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.oracleAddress,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var price *big.Int
	err = parsedABI.UnpackIntoInterface(&price, "getPrice", result)
	if err != nil {
		return nil, err
	}

	return price, nil
}

// getOracleDecimals fetches the decimals from the oracle
func (f *Fulfiller) getOracleDecimals(ctx context.Context) (uint8, error) {
	parsedABI, err := ParseOracleABI()
	if err != nil {
		return 0, err
	}

	data, err := parsedABI.Pack("decimals")
	if err != nil {
		return 0, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.oracleAddress,
		Data: data,
	}, nil)
	if err != nil {
		return 0, err
	}

	var decimals uint8
	err = parsedABI.UnpackIntoInterface(&decimals, "decimals", result)
	if err != nil {
		return 0, err
	}

	return decimals, nil
}

// getQuoteTokenAddress fetches the quote token address from the vault
func (f *Fulfiller) getQuoteTokenAddress(ctx context.Context) (common.Address, error) {
	parsedABI, err := ParseSectorVaultABI()
	if err != nil {
		return common.Address{}, err
	}

	data, err := parsedABI.Pack("QUOTE_TOKEN")
	if err != nil {
		return common.Address{}, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.config.SectorVault,
		Data: data,
	}, nil)
	if err != nil {
		return common.Address{}, err
	}

	var quoteToken common.Address
	err = parsedABI.UnpackIntoInterface(&quoteToken, "QUOTE_TOKEN", result)
	if err != nil {
		return common.Address{}, err
	}

	return quoteToken, nil
}

// getTokenDecimals fetches the decimals for an ERC20 token
func (f *Fulfiller) getTokenDecimals(ctx context.Context, token common.Address) (uint8, error) {
	parsedABI, err := ParseERC20ABI()
	if err != nil {
		return 0, err
	}

	data, err := parsedABI.Pack("decimals")
	if err != nil {
		return 0, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &token,
		Data: data,
	}, nil)
	if err != nil {
		return 0, err
	}

	var decimals uint8
	err = parsedABI.UnpackIntoInterface(&decimals, "decimals", result)
	if err != nil {
		return 0, err
	}

	return decimals, nil
}
