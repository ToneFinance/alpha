# TONE Finance - Deployment Summary

**Network:** Base Sepolia Testnet
**Deployment Date:** December 9, 2025
**Deployer Address:** `0xF199f844515413b13c9A6c6A7FfADD26c40a6F15`
**Fulfillment Engine:** `0x2667A044315Cea7A4FC42Ea7E851FC276ADc5B0F`

## Deployed Contracts

### Shared Infrastructure

| Contract | Address | Explorer |
|----------|---------|----------|
| **MockOracle** | `0x8E6596749b8aDa46195C04e03297469aFA2fd4F3` | [View](https://sepolia.basescan.org/address/0xF6529F44C596fB1c9440F427d1c65b5E1EDfB9c1) |
| **Quote Token (USDC)** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | [View](https://sepolia.basescan.org/address/0x036cbd53842c5426634e7929541ec2318f3dcf7e) |

### AI Sector

| Contract | Address | Explorer |
|----------|---------|----------|
| **SectorVault (AI)** | `0x2eC9856556c6E7cF626542fc620822136d698320` | [View](https://sepolia.basescan.org/address/0xb42704874513Ff4877cD571A747B2b07F0d22D8A) |
| **SectorToken (tAI)** | `0xef303C9eD9eD15606dF2c40a4fFb67907F5631BE` | [View](https://sepolia.basescan.org/address/0x0128A1cAa7b8757B148cDbc454956E64cB620806) |

**Total Weight:** 10,000 basis points (100%)

### Made in America Sector

| Contract | Address | Explorer |
|----------|---------|----------|
| **SectorVault (USA)** | `0x368167Fc17EC24906233104c21f3919A8cE43D99` | [View](https://sepolia.basescan.org/address/0x84Ceed008c36afA34DAD94c7bD7F0A3Ba073D464) |
| **SectorToken (tUSA)** | `0x9BF24297bF3bD256a7EA6e840EF6f9B2fA108b88` | [View](https://sepolia.basescan.org/address/0x36a6760a6f88C857525F79e5089962235373F94D) |

**Total Weight:** 10,000 basis points (100%)

## Architecture

This deployment features:
- **2 Independent Sector Vaults** (AI and Made in America)
- **1 Shared Oracle** for price feeds
- **1 Shared Fulfillment Engine** handling both vaults
- **19 Unique Mock Tokens** (BAT shared between sectors)

## Key Features

### 🔄 Multi-Sector Support
- Single fulfillment engine manages multiple sector vaults concurrently
- Each sector has independent basket composition and weights
- Shared infrastructure (oracle, USDC) for cost efficiency

### 💰 USDC Withdrawals
- Users can withdraw as USDC instead of underlying tokens
- NAV-based pricing ensures fair withdrawal value
- Fulfillment engine provides USDC, receives underlying tokens

### 🔒 Value Verification
- Contract validates underlying token value matches deposit amount
- Uses oracle prices for accurate value calculation
- Prevents over/under-fulfillment attacks

### 📊 Oracle Integration
- Mock oracle with configurable prices
- All tokens initially priced at $1.00
- Oracle decimals: 6 (matches USDC)

## Mock Token Balances

The fulfillment engine address has **500,000 tokens** of each mock token (19 total) for automated deposit fulfillment.

## How to Test

### 1. Get Test Tokens

You'll need Base Sepolia testnet tokens:
- **ETH**: Get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- **USDC**: Get from [Circle Faucet](https://faucet.circle.com/)

### 2. Deposit to AI Sector

```bash
# 1. Approve USDC spending
cast send 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  "approve(address,uint256)" \
  0xb42704874513Ff4877cD571A747B2b07F0d22D8A \
  10000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# 2. Deposit 10 USDC to AI vault
cast send 0xb42704874513Ff4877cD571A747B2b07F0d22D8A \
  "deposit(uint256)" \
  10000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# 3. Wait ~12 seconds for automatic fulfillment
```

### 3. Deposit to Made in America Sector

```bash
# 1. Approve USDC spending
cast send 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  "approve(address,uint256)" \
  0x84Ceed008c36afA34DAD94c7bD7F0A3Ba073D464 \
  10000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# 2. Deposit 10 USDC to MIA vault
cast send 0x84Ceed008c36afA34DAD94c7bD7F0A3Ba073D464 \
  "deposit(uint256)" \
  10000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# 3. Wait ~12 seconds for automatic fulfillment
```

### 4. Withdraw (USDC or Underlying Tokens)

#### Request USDC Withdrawal

```bash
# Request withdrawal from AI vault
cast send 0xb42704874513Ff4877cD571A747B2b07F0d22D8A \
  "requestWithdrawal(uint256)" \
  YOUR_SHARES_AMOUNT \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# Wait ~12 seconds - fulfillment engine will send you USDC
```

## Fulfillment Engine

The automated fulfillment engine handles both sectors simultaneously:
- Listens for `DepositRequested` and `WithdrawalRequested` events from both vaults
- Processes deposits and withdrawals concurrently
- Manages token inventory across 19 unique tokens
- Provides USDC for withdrawals

### Configuration

Located in `fulfillment-engine/.env`:

```env
PRIVATE_KEY=0x...
RPC_URL=https://sepolia.base.org

# Multi-vault configuration
SECTOR_VAULT_AI=0xb42704874513Ff4877cD571A747B2b07F0d22D8A
SECTOR_VAULT_MIA=0x84Ceed008c36afA34DAD94c7bD7F0A3Ba073D464

POLL_INTERVAL=12
LOG_LEVEL=INFO
```

### Running the Engine

```bash
cd fulfillment-engine
go run .
```

The engine will start both vault listeners and process requests concurrently.

## Useful Commands

### Check AI Vault State

```bash
# Get total NAV
cast call 0xb42704874513Ff4877cD571A747B2b07F0d22D8A \
  "getTotalValue()(uint256)" \
  --rpc-url https://sepolia.base.org

# Check your tAI balance
cast call 0x0128A1cAa7b8757B148cDbc454956E64cB620806 \
  "balanceOf(address)(uint256)" \
  YOUR_ADDRESS \
  --rpc-url https://sepolia.base.org
```

### Check MIA Vault State

```bash
# Get total NAV
cast call 0x84Ceed008c36afA34DAD94c7bD7F0A3Ba073D464 \
  "getTotalValue()(uint256)" \
  --rpc-url https://sepolia.base.org

# Check your tMIA balance
cast call 0x36a6760a6f88C857525F79e5089962235373F94D \
  "balanceOf(address)(uint256)" \
  YOUR_ADDRESS \
  --rpc-url https://sepolia.base.org
```

## Important Notes

⚠️ **This is a testnet deployment for alpha testing only**

- Do not use real funds
- Contracts are not audited
- Mock oracle with configurable prices (not production-ready)
- Mock tokens for testing only
- Fulfillment engine runs on single server (not decentralized)

## Resources

- [Base Sepolia Explorer](https://sepolia.basescan.org/)
- [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- [Base Documentation](https://docs.base.org/)
- [Foundry Book](https://book.getfoundry.sh/)
