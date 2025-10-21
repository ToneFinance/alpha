# TONE Finance - Deployment Summary

**Network:** Base Sepolia Testnet
**Deployment Date:** October 21, 2025
**Deployer Address:** `0xF199f844515413b13c9A6c6A7FfADD26c40a6F15`
**Verification Status:** ✅ All contracts verified on Basescan

## Deployed Contracts

### Main Contracts

| Contract | Address | Explorer | Verified Code |
|----------|---------|----------|---------------|
| **SectorVault** | `0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96` | [View](https://sepolia.basescan.org/address/0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96) | [Code](https://sepolia.basescan.org/address/0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96#code) |
| **SectorToken (DEFI)** | `0x71Ad6e213E3fe312E0aF4d93005F139951a15Dd3` | [View](https://sepolia.basescan.org/address/0x71Ad6e213E3fe312E0aF4d93005F139951a15Dd3) | [Code](https://sepolia.basescan.org/address/0x71Ad6e213E3fe312E0aF4d93005F139951a15Dd3#code) |

### Mock Underlying Tokens

| Token | Symbol | Address | Explorer | Verified Code |
|-------|--------|---------|----------|---------------|
| Wrapped ETH | WETH | `0x90e5728Aaa22cF29E7040794E874150e3987FeD1` | [View](https://sepolia.basescan.org/address/0x90e5728Aaa22cF29E7040794E874150e3987FeD1) | [Code](https://sepolia.basescan.org/address/0x90e5728Aaa22cF29E7040794E874150e3987FeD1#code) |
| Uniswap | UNI | `0x86E18F6Ee7596ecB6Cf4483eEc8c1DcDcdcf8733` | [View](https://sepolia.basescan.org/address/0x86E18F6Ee7596ecB6Cf4483eEc8c1DcDcdcf8733) | [Code](https://sepolia.basescan.org/address/0x86E18F6Ee7596ecB6Cf4483eEc8c1DcDcdcf8733#code) |
| Aave | AAVE | `0x03D5bc52620Ec7F1dd082dDE389C49308348d7Dd` | [View](https://sepolia.basescan.org/address/0x03D5bc52620Ec7F1dd082dDE389C49308348d7Dd) | [Code](https://sepolia.basescan.org/address/0x03D5bc52620Ec7F1dd082dDE389C49308348d7Dd#code) |

### Quote Token

| Token | Symbol | Address | Notes |
|-------|--------|---------|-------|
| USD Coin | USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Base Sepolia USDC |

## Vault Configuration

- **Sector Name:** DeFi Blue Chip Sector
- **Sector Symbol:** DEFI
- **Fulfillment Role:** `0xF199f844515413b13c9A6c6A7FfADD26c40a6F15` (Deployer)

### Basket Composition

| Token | Weight | Percentage |
|-------|--------|------------|
| WETH | 3333 | 33.33% |
| UNI | 3333 | 33.33% |
| AAVE | 3334 | 33.34% |

## Mock Token Balances

The deployer address has been minted **1,000,000 tokens** of each mock token for testing purposes:
- WETH: 1,000,000
- UNI: 1,000,000
- AAVE: 1,000,000

## How to Test

### 1. Get Test Tokens

You'll need Base Sepolia testnet tokens:
- **ETH**: Get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- **USDC**: Get from [Circle Faucet](https://faucet.circle.com/) or [Base Sepolia USDC Faucet](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e)

### 2. Deposit Flow

```bash
# 1. Approve USDC spending
cast send 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  "approve(address,uint256)" \
  0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96 \
  1000000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# 2. Deposit USDC (10 USDC = 10000000 with 6 decimals)
cast send 0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96 \
  "deposit(uint256)" \
  10000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY
```

### 3. Fulfill Deposit (as Fulfillment Role)

```bash
# Get deposit ID from the DepositRequested event

# Approve underlying tokens
cast send 0x90e5728Aaa22cF29E7040794E874150e3987FeD1 \
  "approve(address,uint256)" \
  0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96 \
  3333000000000000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# Similar approvals for UNI and AAVE...

# Fulfill deposit
cast send 0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96 \
  "fulfillDeposit(uint256,uint256[])" \
  DEPOSIT_ID \
  "[3333000000000000000,3333000000000000000,3334000000000000000]" \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY
```

### 4. Withdraw

```bash
# Withdraw all your sector tokens
cast send 0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96 \
  "withdraw(uint256)" \
  YOUR_BALANCE \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY
```

## Frontend Setup

The frontend has been updated with the deployed contract addresses. To run it:

```bash
cd tone-alpha
npm install
npm run dev
```

Then open http://localhost:3000 and connect your wallet to Base Sepolia.

## Important Notes

⚠️ **This is a testnet deployment for alpha testing only**

- Do not use real funds
- Contracts are not audited
- Fulfillment role is currently set to deployer address
- No price oracles - share calculation is simplified
- Mock tokens have unlimited minting capability

## Useful Commands

### Check Vault State

```bash
# Get underlying tokens
cast call 0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96 \
  "getUnderlyingTokens()(address[])" \
  --rpc-url https://sepolia.base.org

# Get vault balances
cast call 0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96 \
  "getVaultBalances()(address[],uint256[])" \
  --rpc-url https://sepolia.base.org

# Check your sector token balance
cast call 0x71Ad6e213E3fe312E0aF4d93005F139951a15Dd3 \
  "balanceOf(address)(uint256)" \
  YOUR_ADDRESS \
  --rpc-url https://sepolia.base.org
```

### Check Pending Deposits

```bash
# Get pending deposit details (depositId = 0, 1, 2, ...)
cast call 0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96 \
  "pendingDeposits(uint256)(address,uint256,bool,uint256)" \
  DEPOSIT_ID \
  --rpc-url https://sepolia.base.org
```

## Resources

- [Base Sepolia Explorer](https://sepolia.basescan.org/)
- [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- [Base Documentation](https://docs.base.org/)
- [Foundry Book](https://book.getfoundry.sh/)
