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
	"github.com/ethereum/go-ethereum/ethclient"
)

const (
	// Transaction wait timeout in seconds
	txWaitTimeout = 60
	// Post-transaction state sync delay
	txSyncDelay = 2 * time.Second
)

type fulfillerAccount struct {
	mu    sync.Mutex
	nonce *uint64

	fromAddress common.Address
	privateKey  *ecdsa.PrivateKey
	client      *ethclient.Client
}

type Fulfiller struct {
	client            *ethclient.Client
	config            *Config
	vaultConfig       VaultConfig              // Specific vault this fulfiller manages
	account           *fulfillerAccount        // account to use for fullfillments
	wg                sync.WaitGroup           // Track in-flight fulfillments
	mu                sync.Mutex               // protectes the approvedTokens, tokenDecimals map
	underlyingTokens  []common.Address         // Cached underlying tokens
	underlyingWeights []*big.Int               // Cached underlying weights
	approvedTokens    map[common.Address]bool  // Track which tokens have max approval
	oracleAddress     common.Address           // Oracle contract address
	oracleDecimals    uint8                    // Oracle price decimals
	quoteTokenAddress common.Address           // Quote token (e.g., USDC) address
	quoteDecimals     uint8                    // Quote token decimals
	tokenDecimals     map[common.Address]uint8 // Underlying token decimals
}

func NewFulfiller(config *Config, vaultConfig VaultConfig, account *fulfillerAccount) (*Fulfiller, error) {
	fulfiller := &Fulfiller{
		account:        account,
		client:         account.client,
		config:         config,
		vaultConfig:    vaultConfig,
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

	Logger.Info("Fulfiller initialized for vault",
		"vault_name", vaultConfig.Name,
		"vault_address", vaultConfig.Address.Hex(),
		"fulfiller_address", account.fromAddress.Hex(),
		"oracle_address", oracleAddr.Hex(),
		"oracle_decimals", oracleDecimals,
		"quote_token", quoteTokenAddr.Hex(),
		"quote_decimals", quoteDecimals,
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

	// Fetch token prices from oracle
	tokenPrices := make([]*big.Int, len(f.underlyingTokens))
	for i, token := range f.underlyingTokens {
		price, err := f.getTokenPrice(ctx, token)
		if err != nil {
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

	// Normalize quote amount to oracle decimals for calculations
	// oracle.getValue() returns values in oracle decimals, so we must normalize quoteAmount
	var normalizedQuoteAmount *big.Int
	if f.quoteDecimals >= f.oracleDecimals {
		normalizedQuoteAmount = new(big.Int).Div(quoteAmount, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(f.quoteDecimals-f.oracleDecimals)), nil))
	} else {
		normalizedQuoteAmount = new(big.Int).Mul(quoteAmount, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(f.oracleDecimals-f.quoteDecimals)), nil))
	}

	Logger.Debug("Normalized quote amount",
		"deposit_id", depositId.String(),
		"original_quote_amount", quoteAmount.String(),
		"normalized_quote_amount", normalizedQuoteAmount.String(),
		"quote_decimals", f.quoteDecimals,
		"oracle_decimals", f.oracleDecimals,
	)

	// Step 1: Calculate base amounts for each token using floor division
	// oracle.getValue(token, amount) = (amount * price) / 10^tokenDecimals
	// We want: amount = floor((valueAllocation * 10^tokenDecimals) / price)
	totalProvidedValue := big.NewInt(0)

	for i, weight := range f.underlyingWeights {
		token := f.underlyingTokens[i]
		tokenDec := f.tokenDecimals[token]

		// Calculate value allocation for this token (in oracle decimals)
		// valueAllocation = normalizedQuoteAmount * weight / totalWeight
		valueAllocation := new(big.Int).Div(new(big.Int).Mul(normalizedQuoteAmount, weight), totalWeight)

		// Calculate token amount: (valueAllocation * 10^tokenDecimals) / price
		// Using floor division initially
		tokenDecMultiplier := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(tokenDec)), nil)
		numerator := new(big.Int).Mul(valueAllocation, tokenDecMultiplier)
		amount := new(big.Int).Div(numerator, tokenPrices[i])
		underlyingAmounts[i] = amount

		// Calculate the actual value this amount provides
		// actualValue = (amount * price) / 10^tokenDecimals
		actualValue := new(big.Int).Div(new(big.Int).Mul(amount, tokenPrices[i]), tokenDecMultiplier)
		totalProvidedValue = new(big.Int).Add(totalProvidedValue, actualValue)

		Logger.Debug("Calculated underlying token amount",
			"deposit_id", depositId.String(),
			"token_index", i,
			"token", token.Hex(),
			"token_decimals", tokenDec,
			"weight", weight.String(),
			"price", tokenPrices[i].String(),
			"value_allocation", valueAllocation.String(),
			"amount", amount.String(),
			"actual_value", actualValue.String(),
		)
	}

	// Step 2: Check if we need to add more value to meet the tolerance
	// We need: abs(totalProvidedValue - normalizedQuoteAmount) <= tolerance
	// where tolerance = 0.1% + 1 wei
	tolerance := new(big.Int).Div(normalizedQuoteAmount, big.NewInt(1000))
	tolerance = new(big.Int).Add(tolerance, big.NewInt(1))

	var difference *big.Int
	if totalProvidedValue.Cmp(normalizedQuoteAmount) >= 0 {
		difference = new(big.Int).Sub(totalProvidedValue, normalizedQuoteAmount)
	} else {
		difference = new(big.Int).Sub(normalizedQuoteAmount, totalProvidedValue)
	}

	Logger.Debug("Deposit value check",
		"deposit_id", depositId.String(),
		"normalized_quote_amount", normalizedQuoteAmount.String(),
		"total_provided_value", totalProvidedValue.String(),
		"difference", difference.String(),
		"tolerance", tolerance.String(),
	)

	// Step 3: If we're providing less than required, increase amounts to meet the target
	// This ensures we always meet or exceed the required value
	if totalProvidedValue.Cmp(normalizedQuoteAmount) < 0 {
		// We're under the quote amount. Incrementally increase token amounts to meet or exceed it
		// Find the token with the largest weight (usually most liquid)
		maxWeightIdx := 0
		maxWeight := f.underlyingWeights[0]
		for i, w := range f.underlyingWeights {
			if w.Cmp(maxWeight) > 0 {
				maxWeight = w
				maxWeightIdx = i
			}
		}

		// Keep increasing until we meet the target
		currentShortfall := new(big.Int).Sub(normalizedQuoteAmount, totalProvidedValue)
		tokenDecMultiplier := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(f.tokenDecimals[f.underlyingTokens[maxWeightIdx]])), nil)
		price := tokenPrices[maxWeightIdx]

		// Calculate ceiling((shortfall * 10^tokenDecimals) / price) + 1 as safety margin
		// This uses ceiling division: (a + b - 1) / b to round up
		increaseNumerator := new(big.Int).Mul(currentShortfall, tokenDecMultiplier)
		increaseAmount := new(big.Int).Div(
			new(big.Int).Add(increaseNumerator, new(big.Int).Sub(price, big.NewInt(1))),
			price,
		)

		// Always add at least 1 token to ensure value improvement
		if increaseAmount.Sign() <= 0 {
			increaseAmount = big.NewInt(1)
		}

		underlyingAmounts[maxWeightIdx] = new(big.Int).Add(underlyingAmounts[maxWeightIdx], increaseAmount)

		// Recalculate actual value provided after increase
		newActualValue := new(big.Int).Div(new(big.Int).Mul(increaseAmount, price), tokenDecMultiplier)
		newTotalValue := new(big.Int).Add(totalProvidedValue, newActualValue)

		Logger.Debug("Increased token amount to meet quote",
			"deposit_id", depositId.String(),
			"token_index", maxWeightIdx,
			"token", f.underlyingTokens[maxWeightIdx].Hex(),
			"shortfall", currentShortfall.String(),
			"increase_tokens", increaseAmount.String(),
			"increase_value", newActualValue.String(),
			"new_total_value", newTotalValue.String(),
			"target_value", normalizedQuoteAmount.String(),
		)
	}

	// Ensure all tokens have max approval (only approves once per token)
	for _, token := range f.underlyingTokens {
		if err := f.ensureTokenApproval(ctx, token); err != nil {
			return fmt.Errorf("failed to ensure approval for token %s: %v", token.Hex(), err)
		}
	}
	if err := f.callFulfillDeposit(ctx, depositId, underlyingAmounts); err != nil {
		return fmt.Errorf("failed to call fulfillDeposit: %v", err)
	}

	Logger.Info("Deposit fulfilled successfully",
		"deposit_id", depositId.String(),
		"quote_amount", quoteAmount.String(),
	)
	return nil
}

func (f *Fulfiller) FulfillWithdrawal(ctx context.Context, withdrawalId *big.Int, sharesAmount *big.Int) error {
	// Track this in-flight operation
	f.wg.Add(1)
	defer f.wg.Done()

	// Check if context is already cancelled before starting
	select {
	case <-ctx.Done():
		Logger.Info("Withdrawal fulfillment cancelled before start",
			"withdrawal_id", withdrawalId.String(),
			"reason", ctx.Err(),
		)
		return ctx.Err()
	default:
	}

	Logger.Info("Starting withdrawal fulfillment",
		"vault_name", f.vaultConfig.Name,
		"withdrawal_id", withdrawalId.String(),
		"shares_amount", sharesAmount.String(),
	)

	// Get expected USDC value from vault contract
	expectedUSDC, err := f.calculateWithdrawalValue(ctx, sharesAmount)
	if err != nil {
		Logger.Error("Failed to calculate withdrawal value",
			"vault_name", f.vaultConfig.Name,
			"withdrawal_id", withdrawalId.String(),
			"error", err,
		)
		return fmt.Errorf("failed to calculate withdrawal value: %v", err)
	}

	Logger.Info("Calculated expected USDC for withdrawal",
		"vault_name", f.vaultConfig.Name,
		"withdrawal_id", withdrawalId.String(),
		"expected_usdc", expectedUSDC.String(),
	)

	// Check if fulfiller has enough USDC balance
	usdcBalance, err := f.getTokenBalance(ctx, f.quoteTokenAddress, f.account.fromAddress)
	if err != nil {
		return fmt.Errorf("failed to get USDC balance: %v", err)
	}

	if usdcBalance.Cmp(expectedUSDC) < 0 {
		Logger.Error("Insufficient USDC balance for withdrawal",
			"vault_name", f.vaultConfig.Name,
			"withdrawal_id", withdrawalId.String(),
			"required", expectedUSDC.String(),
			"available", usdcBalance.String(),
		)
		return fmt.Errorf("insufficient USDC: have %s, need %s", usdcBalance.String(), expectedUSDC.String())
	}

	// Ensure USDC has max approval to vault
	if err := f.ensureTokenApproval(ctx, f.quoteTokenAddress); err != nil {
		Logger.Error("Failed to ensure USDC approval",
			"vault_name", f.vaultConfig.Name,
			"withdrawal_id", withdrawalId.String(),
			"error", err,
		)
		return fmt.Errorf("failed to ensure USDC approval: %v", err)
	}

	// Calculate underlying amounts to send back based on vault composition
	// We need to send proportional amounts of each underlying token
	underlyingAmounts := make([]*big.Int, len(f.underlyingTokens))

	// Fetch token prices from oracle
	tokenPrices := make([]*big.Int, len(f.underlyingTokens))
	for i, token := range f.underlyingTokens {
		price, err := f.getTokenPrice(ctx, token)
		if err != nil {
			Logger.Error("Failed to get token price for withdrawal",
				"withdrawal_id", withdrawalId.String(),
				"token_index", i,
				"token", token.Hex(),
				"error", err,
			)
			return fmt.Errorf("failed to get price for token %s: %v", token.Hex(), err)
		}
		tokenPrices[i] = price
	}

	// Calculate total weight
	totalWeight := big.NewInt(0)
	for _, weight := range f.underlyingWeights {
		totalWeight = new(big.Int).Add(totalWeight, weight)
	}

	// For each underlying token, calculate the amount based on weight and prices
	for i, weight := range f.underlyingWeights {
		token := f.underlyingTokens[i]
		tokenDec := f.tokenDecimals[token]

		// Step 1: Calculate value allocation (in quote token decimals / USDC decimals)
		valueAllocation := new(big.Int).Div(new(big.Int).Mul(expectedUSDC, weight), totalWeight)

		// Step 2: Oracle returns values in USDC decimals (6), same as quote token
		// No need for normalization - oracle.getValue() returns USDC amounts directly
		// The value is already in the correct denomination

		// Step 3: Calculate token amount needed to provide the value allocation
		// oracle.getValue(token, amount) = (amount * price) / 10^tokenDecimals
		// We want: oracle.getValue(token, amount) >= valueAllocation
		// So: amount >= (valueAllocation * 10^tokenDecimals) / price
		// Use ceiling division to ensure we provide enough value
		tokenDecMultiplier := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(tokenDec)), nil)
		numerator := new(big.Int).Mul(valueAllocation, tokenDecMultiplier)
		// Ceiling division: (a + b - 1) / b
		amount := new(big.Int).Div(
			new(big.Int).Add(numerator, new(big.Int).Sub(tokenPrices[i], big.NewInt(1))),
			tokenPrices[i],
		)
		underlyingAmounts[i] = amount

		Logger.Debug("Calculated underlying token amount for withdrawal",
			"withdrawal_id", withdrawalId.String(),
			"token_index", i,
			"token", token.Hex(),
			"token_decimals", tokenDec,
			"weight", weight.String(),
			"price", tokenPrices[i].String(),
			"value_allocation", valueAllocation.String(),
			"amount", amount.String(),
		)
	}

	Logger.Info("Fulfilling withdrawal with USDC",
		"vault_name", f.vaultConfig.Name,
		"withdrawal_id", withdrawalId.String(),
		"usdc_amount", expectedUSDC.String(),
	)

	// Call fulfillWithdrawal on the vault
	if err := f.callFulfillWithdrawal(ctx, withdrawalId, underlyingAmounts); err != nil {
		Logger.Error("Failed to fulfill withdrawal",
			"vault_name", f.vaultConfig.Name,
			"withdrawal_id", withdrawalId.String(),
			"error", err,
		)
		return fmt.Errorf("failed to call fulfillWithdrawal: %v", err)
	}

	Logger.Info("Withdrawal fulfilled successfully",
		"vault_name", f.vaultConfig.Name,
		"withdrawal_id", withdrawalId.String(),
		"shares_amount", sharesAmount.String(),
		"usdc_transferred", expectedUSDC.String(),
	)
	return nil
}

func (f *Fulfiller) callFulfillWithdrawal(ctx context.Context, withdrawalId *big.Int, amounts []*big.Int) error {
	parsedABI, err := ParseSectorVaultABI()
	if err != nil {
		return fmt.Errorf("parse sector vault abi: %w", err)
	}

	data, err := parsedABI.Pack("fulfillWithdrawal", withdrawalId, amounts)
	if err != nil {
		return fmt.Errorf("pack call: %w", err)
	}

	tx, err := f.account.sendTransaction(ctx, f.vaultConfig.Address, big.NewInt(0), data)
	if err != nil {
		return fmt.Errorf("send: %w", err)
	}

	Logger.Info("Fulfill withdrawal transaction sent",
		"withdrawal_id", withdrawalId.String(),
		"tx_hash", tx.Hash().Hex(),
	)

	// Wait for transaction to be mined
	if err := f.waitForTransaction(ctx, tx); err != nil {
		Logger.Error("Fulfill withdrawal transaction failed",
			"withdrawal_id", withdrawalId.String(),
			"tx_hash", tx.Hash().Hex(),
			"error", err,
		)
		return err
	}

	Logger.Debug("Fulfill withdrawal transaction confirmed",
		"withdrawal_id", withdrawalId.String(),
		"tx_hash", tx.Hash().Hex(),
	)
	return nil
}

// calculateWithdrawalValue calls the vault's calculateWithdrawalValue function
func (f *Fulfiller) calculateWithdrawalValue(ctx context.Context, sharesAmount *big.Int) (*big.Int, error) {
	parsedABI, err := ParseSectorVaultABI()
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %v", err)
	}

	data, err := parsedABI.Pack("calculateWithdrawalValue", sharesAmount)
	if err != nil {
		return nil, fmt.Errorf("failed to pack data: %v", err)
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.vaultConfig.Address,
		Data: data,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to call contract: %v", err)
	}

	var expectedUSDC *big.Int
	if err := parsedABI.UnpackIntoInterface(&expectedUSDC, "calculateWithdrawalValue", result); err != nil {
		return nil, fmt.Errorf("failed to unpack result: %v", err)
	}

	return expectedUSDC, nil
}

// getTokenBalance gets the balance of a token for a given address
func (f *Fulfiller) getTokenBalance(ctx context.Context, token common.Address, owner common.Address) (*big.Int, error) {
	parsedABI, err := ParseERC20ABI()
	if err != nil {
		return nil, fmt.Errorf("failed to parse ERC20 ABI: %v", err)
	}

	data, err := parsedABI.Pack("balanceOf", owner)
	if err != nil {
		return nil, fmt.Errorf("failed to pack data: %v", err)
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &token,
		Data: data,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to call contract: %v", err)
	}

	var balance *big.Int
	if err := parsedABI.UnpackIntoInterface(&balance, "balanceOf", result); err != nil {
		return nil, fmt.Errorf("failed to unpack result: %v", err)
	}

	return balance, nil
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
			Logger.Debug("Token already has sufficient allowance, skipping approval",
				"token", token.Hex(),
				"allowance", allowance.String(),
			)
			// Mark as approved
			f.mu.Lock()
			f.approvedTokens[token] = true
			f.mu.Unlock()
			return nil
		}

		Logger.Debug("Current allowance insufficient, approving max amount",
			"token", token.Hex(),
			"current_allowance", allowance.String(),
		)
	}

	// Approve max uint256 amount
	maxUint256 := new(big.Int)
	maxUint256.SetString("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16)

	parsedABI, _ := ParseERC20ABI()
	data, err := parsedABI.Pack("approve", f.vaultConfig.Address, maxUint256)
	if err != nil {
		return fmt.Errorf("pack 'approve': %w", err)
	}

	tx, err := f.account.sendTransaction(ctx, token, big.NewInt(0), data)
	if err != nil {
		return err
	}

	Logger.Debug("Max approval transaction sent",
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

	Logger.Debug("Max approval confirmed",
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

	data, err := parsedABI.Pack("allowance", f.account.fromAddress, f.vaultConfig.Address)
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

	tx, err := f.account.sendTransaction(ctx, f.vaultConfig.Address, big.NewInt(0), data)
	if err != nil {
		return err
	}

	Logger.Info("Fulfill deposit transaction sent",
		"deposit_id", depositId.String(),
		"tx_hash", tx.Hash().Hex(),
	)

	// Wait for transaction to be mined
	if err := f.waitForTransaction(ctx, tx); err != nil {
		Logger.Debug("Fulfill deposit transaction failed",
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

func (f *fulfillerAccount) sendTransaction(ctx context.Context, to common.Address, value *big.Int, data []byte) (*types.Transaction, error) {
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
		return nil, fmt.Errorf("get gas price: %w", err)
	}

	chainID, err := f.client.NetworkID(ctx)
	if err != nil {
		return nil, fmt.Errorf("get network ID: %w", err)
	}

	tx := types.NewTransaction(nonce, to, value, 8000000, gasPrice, data)

	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), f.privateKey)
	if err != nil {
		return nil, fmt.Errorf("sign: %w", err)
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
		To:   &f.vaultConfig.Address,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var nextDepositId *big.Int
	err = parsedABI.UnpackIntoInterface(&nextDepositId, "nextDepositId", result)
	if err != nil {
		return nil, fmt.Errorf("unpack: %w", err)
	}

	return nextDepositId, nil
}

func (f *Fulfiller) GetPendingDeposit(ctx context.Context, depositId *big.Int) (*PendingDeposit, error) {
	parsedABI, _ := ParseSectorVaultABI()

	data, err := parsedABI.Pack("pendingDeposits", depositId)
	if err != nil {
		return nil, fmt.Errorf("pack pendingDeposits: %w", err)
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.vaultConfig.Address,
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
			To:   &f.vaultConfig.Address,
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
			To:   &f.vaultConfig.Address,
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

	Logger.Debug("Loaded underlying tokens from vault",
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
		To:   &f.vaultConfig.Address,
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
		To:   &f.vaultConfig.Address,
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

// getVaultBalances fetches the current balances of all underlying tokens in the vault
func (f *Fulfiller) getVaultBalances(ctx context.Context) ([]*big.Int, error) {
	parsedABI, err := ParseSectorVaultABI()
	if err != nil {
		return nil, err
	}

	data, err := parsedABI.Pack("getVaultBalances")
	if err != nil {
		return nil, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.vaultConfig.Address,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var output struct {
		Tokens   []common.Address
		Balances []*big.Int
	}

	err = parsedABI.UnpackIntoInterface(&output, "getVaultBalances", result)
	if err != nil {
		return nil, err
	}

	return output.Balances, nil
}

// getSectorTokenTotalSupply fetches the total supply of sector tokens
func (f *Fulfiller) getSectorTokenTotalSupply(ctx context.Context) (*big.Int, error) {
	// First get the sector token address
	parsedVaultABI, err := ParseSectorVaultABI()
	if err != nil {
		return nil, err
	}

	data, err := parsedVaultABI.Pack("SECTOR_TOKEN")
	if err != nil {
		return nil, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.vaultConfig.Address,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var sectorTokenAddr common.Address
	err = parsedVaultABI.UnpackIntoInterface(&sectorTokenAddr, "SECTOR_TOKEN", result)
	if err != nil {
		return nil, err
	}

	// Now call totalSupply on the sector token
	parsedERC20ABI, err := ParseERC20ABI()
	if err != nil {
		return nil, err
	}

	data, err = parsedERC20ABI.Pack("totalSupply")
	if err != nil {
		return nil, err
	}

	result, err = f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &sectorTokenAddr,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var totalSupply *big.Int
	err = parsedERC20ABI.UnpackIntoInterface(&totalSupply, "totalSupply", result)
	if err != nil {
		return nil, err
	}

	return totalSupply, nil
}

func (f *Fulfiller) GetNextWithdrawalId(ctx context.Context) (*big.Int, error) {
	parsedABI, _ := ParseSectorVaultABI()

	data, err := parsedABI.Pack("nextWithdrawalId")
	if err != nil {
		return nil, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.vaultConfig.Address,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var nextWithdrawalId *big.Int
	err = parsedABI.UnpackIntoInterface(&nextWithdrawalId, "nextWithdrawalId", result)
	if err != nil {
		return nil, err
	}

	return nextWithdrawalId, nil
}

func (f *Fulfiller) GetPendingWithdrawal(ctx context.Context, withdrawalId *big.Int) (*PendingWithdrawal, error) {
	parsedABI, _ := ParseSectorVaultABI()

	data, err := parsedABI.Pack("pendingWithdrawals", withdrawalId)
	if err != nil {
		return nil, err
	}

	result, err := f.client.CallContract(ctx, ethereum.CallMsg{
		To:   &f.vaultConfig.Address,
		Data: data,
	}, nil)
	if err != nil {
		return nil, err
	}

	var withdrawal PendingWithdrawal
	err = parsedABI.UnpackIntoInterface(&[]interface{}{
		&withdrawal.User,
		&withdrawal.SharesAmount,
		&withdrawal.Fulfilled,
		&withdrawal.Timestamp,
	}, "pendingWithdrawals", result)
	if err != nil {
		return nil, err
	}

	return &withdrawal, nil
}
