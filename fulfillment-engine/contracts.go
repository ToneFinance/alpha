package main

import (
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// ERC20 ABI (approve, allowance, balanceOf, decimals, and totalSupply functions)
const ERC20ABI = `[
	{
		"constant": false,
		"inputs": [
			{"name": "spender", "type": "address"},
			{"name": "amount", "type": "uint256"}
		],
		"name": "approve",
		"outputs": [{"name": "", "type": "bool"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [
			{"name": "owner", "type": "address"},
			{"name": "spender", "type": "address"}
		],
		"name": "allowance",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [{"name": "account", "type": "address"}],
		"name": "balanceOf",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "decimals",
		"outputs": [{"name": "", "type": "uint8"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "totalSupply",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	}
]`

// SectorVault ABI (deposit and withdrawal functions)
const SectorVaultABI = `[
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "name": "user", "type": "address"},
			{"indexed": true, "name": "depositId", "type": "uint256"},
			{"indexed": false, "name": "quoteAmount", "type": "uint256"},
			{"indexed": false, "name": "timestamp", "type": "uint256"}
		],
		"name": "DepositRequested",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "name": "user", "type": "address"},
			{"indexed": true, "name": "withdrawalId", "type": "uint256"},
			{"indexed": false, "name": "sharesAmount", "type": "uint256"},
			{"indexed": false, "name": "timestamp", "type": "uint256"}
		],
		"name": "WithdrawalRequested",
		"type": "event"
	},
	{
		"constant": false,
		"inputs": [
			{"name": "depositId", "type": "uint256"},
			{"name": "underlyingAmounts", "type": "uint256[]"}
		],
		"name": "fulfillDeposit",
		"outputs": [],
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{"name": "withdrawalId", "type": "uint256"},
			{"name": "underlyingAmounts", "type": "uint256[]"}
		],
		"name": "fulfillWithdrawal",
		"outputs": [],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [{"name": "", "type": "uint256"}],
		"name": "pendingDeposits",
		"outputs": [
			{"name": "user", "type": "address"},
			{"name": "quoteAmount", "type": "uint256"},
			{"name": "fulfilled", "type": "bool"},
			{"name": "timestamp", "type": "uint256"}
		],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [{"name": "", "type": "uint256"}],
		"name": "pendingWithdrawals",
		"outputs": [
			{"name": "user", "type": "address"},
			{"name": "sharesAmount", "type": "uint256"},
			{"name": "fulfilled", "type": "bool"},
			{"name": "timestamp", "type": "uint256"}
		],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "nextDepositId",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "nextWithdrawalId",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [{"name": "sharesAmount", "type": "uint256"}],
		"name": "calculateWithdrawalValue",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "getTotalValue",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "getVaultBalances",
		"outputs": [
			{"name": "tokens", "type": "address[]"},
			{"name": "balances", "type": "uint256[]"}
		],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [{"name": "", "type": "uint256"}],
		"name": "underlyingTokens",
		"outputs": [{"name": "", "type": "address"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [{"name": "", "type": "address"}],
		"name": "targetWeights",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "oracle",
		"outputs": [{"name": "", "type": "address"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "QUOTE_TOKEN",
		"outputs": [{"name": "", "type": "address"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "SECTOR_TOKEN",
		"outputs": [{"name": "", "type": "address"}],
		"type": "function"
	}
]`

// Oracle ABI (getPrice function)
const OracleABI = `[
	{
		"constant": true,
		"inputs": [{"name": "token", "type": "address"}],
		"name": "getPrice",
		"outputs": [{"name": "", "type": "uint256"}],
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "decimals",
		"outputs": [{"name": "", "type": "uint8"}],
		"type": "function"
	}
]`

// DepositRequestedEvent represents the DepositRequested event
type DepositRequestedEvent struct {
	User        common.Address
	DepositId   *big.Int
	QuoteAmount *big.Int
	Timestamp   *big.Int
}

// WithdrawalRequestedEvent represents the WithdrawalRequested event
type WithdrawalRequestedEvent struct {
	User         common.Address
	WithdrawalId *big.Int
	SharesAmount *big.Int
	Timestamp    *big.Int
}

// PendingDeposit represents a pending deposit
type PendingDeposit struct {
	User        common.Address
	QuoteAmount *big.Int
	Fulfilled   bool
	Timestamp   *big.Int
}

// PendingWithdrawal represents a pending withdrawal
type PendingWithdrawal struct {
	User         common.Address
	SharesAmount *big.Int
	Fulfilled    bool
	Timestamp    *big.Int
}

func ParseERC20ABI() (abi.ABI, error) {
	return abi.JSON(strings.NewReader(ERC20ABI))
}

func ParseSectorVaultABI() (abi.ABI, error) {
	return abi.JSON(strings.NewReader(SectorVaultABI))
}

func ParseOracleABI() (abi.ABI, error) {
	return abi.JSON(strings.NewReader(OracleABI))
}
