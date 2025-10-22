# TONE Finance - Deployment Summary

**Network:** Base Sepolia Testnet
**Deployment Date:** October 22, 2025
**Deployer Address:** `0xF199f844515413b13c9A6c6A7FfADD26c40a6F15`
**Fulfillment Engine:** `0x2667A044315Cea7A4FC42Ea7E851FC276ADc5B0F`

## Deployed Contracts

### Main Contracts

| Contract | Address | Explorer |
|----------|---------|----------|
| **SectorVault** | `0xfE33131EDbeC8b1f34550e63B5E63910985F99c6` | [View](https://sepolia.basescan.org/address/0xfE33131EDbeC8b1f34550e63B5E63910985F99c6) |
| **SectorToken (AI)** | `0xd596E4a4EcbB73601FAa875c3277Af9F6Cff6948` | [View](https://sepolia.basescan.org/address/0xd596E4a4EcbB73601FAa875c3277Af9F6Cff6948) |
| **MockOracle** | `0x114726f91082b788BC828c4B41A0eA03BFF715FB` | [View](https://sepolia.basescan.org/address/0x114726f91082b788BC828c4B41A0eA03BFF715FB) |

### Mock AI Underlying Tokens

| Token | Symbol | Address | Price (USDC) | Explorer |
|-------|--------|---------|--------------|----------|
| 0x0 | 0X0 | `0x99a3AfE6863042659149bfdc684FC0Ce86549635` | $1.00 | [View](https://sepolia.basescan.org/address/0x99a3AfE6863042659149bfdc684FC0Ce86549635) |
| Arkham | ARKM | `0x1fF627048712b205a5Fb6BD143179e7B6bDC92B1` | $1.00 | [View](https://sepolia.basescan.org/address/0x1fF627048712b205a5Fb6BD143179e7B6bDC92B1) |
| Fetch.ai | FET | `0xb9080604ab9ba300458b324e9A851aBbF157b44A` | **$2.00** | [View](https://sepolia.basescan.org/address/0xb9080604ab9ba300458b324e9A851aBbF157b44A) |
| Kaito | KAITO | `0x2F6c2B645c6721918518895a3834088DDB47882C` | **$2.00** | [View](https://sepolia.basescan.org/address/0x2F6c2B645c6721918518895a3834088DDB47882C) |
| NEAR Protocol | NEAR | `0x13366FaEE20f1F81A5c855ed17e90cE83Ba3603C` | **$2.00** | [View](https://sepolia.basescan.org/address/0x13366FaEE20f1F81A5c855ed17e90cE83Ba3603C) |
| Nosana | NOS | `0xACEF5eb0144977E426E1Fe95C6E8CFdf6b15ca77` | $1.00 | [View](https://sepolia.basescan.org/address/0xACEF5eb0144977E426E1Fe95C6E8CFdf6b15ca77) |
| PAAL AI | PAAL | `0x1D256a31e5eB29C98Ab234aEfc624c6e2eDf5Ae9` | $1.00 | [View](https://sepolia.basescan.org/address/0x1D256a31e5eB29C98Ab234aEfc624c6e2eDf5Ae9) |
| Render | RENDER | `0x817a1D2b2d99E981f55964fBb2320bb3f93A9F49` | $1.00 | [View](https://sepolia.basescan.org/address/0x817a1D2b2d99E981f55964fBb2320bb3f93A9F49) |
| Bittensor | TAO | `0x2B9c2665182f902E42E5E8Ce4b82840371563248` | $1.00 | [View](https://sepolia.basescan.org/address/0x2B9c2665182f902E42E5E8Ce4b82840371563248) |
| Virtual Protocol | VIRTUAL | `0x603F61fE50dbbc97DFA530f95EaF1733313AbCDa` | $1.00 | [View](https://sepolia.basescan.org/address/0x603F61fE50dbbc97DFA530f95EaF1733313AbCDa) |

### Quote Token

| Token | Symbol | Address | Notes |
|-------|--------|---------|-------|
| USD Coin | USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Base Sepolia USDC |

## Vault Configuration

- **Sector Name:** AI Sector
- **Sector Symbol:** AI
- **Fulfillment Role:** `0x2667A044315Cea7A4FC42Ea7E851FC276ADc5B0F` (Automated fulfillment engine)
- **Oracle:** `0x114726f91082b788BC828c4B41A0eA03BFF715FB` (Mock price oracle)

### Basket Composition

Equal weight distribution across 10 AI tokens:

| Token | Weight | Percentage |
|-------|--------|------------|
| 0X0 | 1000 | 10.00% |
| ARKM | 1000 | 10.00% |
| FET | 1000 | 10.00% |
| KAITO | 1000 | 10.00% |
| NEAR | 1000 | 10.00% |
| NOS | 1000 | 10.00% |
| PAAL | 1000 | 10.00% |
| RENDER | 1000 | 10.00% |
| TAO | 1000 | 10.00% |
| VIRTUAL | 1000 | 10.00% |

**Total Weight:** 10,000 basis points (100%)

## Key Features

### 🔒 Value Verification
The vault now includes **automatic value verification** during fulfillment:
- Contract validates that the total value of underlying tokens matches the deposited quote amount
- Uses oracle prices to calculate actual value
- Prevents over/under-fulfillment attacks
- Reverts with `FulfillmentValueMismatch` error if values don't match

### 📊 Price-Aware Fulfillment Engine
The automated fulfillment engine:
- Fetches real-time prices from the oracle
- Calculates token amounts based on **price AND weight** (not just weight)
- Dynamically queries all decimal precisions (no hardcoded values)
- Ensures deposits receive exactly the value they paid for

**Example:** For a 1 USDC deposit with 10% weight per token:
- **$1 tokens:** Receives 0.1 tokens (worth $0.10)
- **$2 tokens:** Receives 0.05 tokens (worth $0.10)
- **Total value:** Exactly $1.00 ✅

### 🎯 Oracle Integration
- Mock oracle provides configurable prices for all tokens
- FET, KAITO, and NEAR priced at $2.00 for testing price variance
- Other tokens priced at $1.00
- Oracle decimals: 6 (matches USDC)

## Mock Token Balances

The fulfillment engine address has **500,000 tokens** of each mock token for automated deposit fulfillment.

## How to Test

### 1. Get Test Tokens

You'll need Base Sepolia testnet tokens:
- **ETH**: Get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- **USDC**: Get from [Circle Faucet](https://faucet.circle.com/) or [Base Sepolia USDC Faucet](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e)

### 2. Deposit Flow (Automated)

The deposit flow is now **fully automated** via the fulfillment engine:

```bash
# 1. Approve USDC spending
cast send 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  "approve(address,uint256)" \
  0xfE33131EDbeC8b1f34550e63B5E63910985F99c6 \
  1000000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# 2. Deposit USDC (10 USDC = 10000000 with 6 decimals)
cast send 0xfE33131EDbeC8b1f34550e63B5E63910985F99c6 \
  "deposit(uint256)" \
  10000000 \
  --rpc-url https://sepolia.base.org \
  --private-key YOUR_PRIVATE_KEY

# 3. Wait ~12 seconds for automatic fulfillment
# The fulfillment engine will detect the deposit and fulfill it automatically!
```

### 3. Withdraw

```bash
# Withdraw all your sector tokens
cast send 0xfE33131EDbeC8b1f34550e63B5E63910985F99c6 \
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

## Fulfillment Engine

The automated fulfillment engine is a Go service that:
- Listens for `DepositRequested` events
- Fetches current token prices from oracle
- Calculates correct token amounts based on prices and weights
- Automatically fulfills deposits within ~12 seconds
- Validates value matches before submitting

### Configuration

Located in `fulfillment-engine/.env`:

```bash
PRIVATE_KEY=0x...
RPC_URL=https://sepolia.base.org
SECTOR_VAULT=0xfE33131EDbeC8b1f34550e63B5E63910985F99c6
POLL_INTERVAL=12
```

### Running the Engine

```bash
cd fulfillment-engine
go run .
```

## Important Notes

⚠️ **This is a testnet deployment for alpha testing only**

- Do not use real funds
- Contracts are not audited
- Mock oracle with configurable prices (not production-ready)
- Mock tokens have unlimited minting capability
- Fulfillment engine runs on single server (not decentralized)

## Useful Commands

### Check Vault State

```bash
# Get underlying tokens
cast call 0xfE33131EDbeC8b1f34550e63B5E63910985F99c6 \
  "getUnderlyingTokens()(address[])" \
  --rpc-url https://sepolia.base.org

# Get vault balances
cast call 0xfE33131EDbeC8b1f34550e63B5E63910985F99c6 \
  "getVaultBalances()(address[],uint256[])" \
  --rpc-url https://sepolia.base.org

# Get total NAV
cast call 0xfE33131EDbeC8b1f34550e63B5E63910985F99c6 \
  "getTotalValue()(uint256)" \
  --rpc-url https://sepolia.base.org

# Check your sector token balance
cast call 0xd596E4a4EcbB73601FAa875c3277Af9F6Cff6948 \
  "balanceOf(address)(uint256)" \
  YOUR_ADDRESS \
  --rpc-url https://sepolia.base.org
```

### Check Oracle Prices

```bash
# Get price for a token (returns price with 6 decimals)
cast call 0x114726f91082b788BC828c4B41A0eA03BFF715FB \
  "getPrice(address)(uint256)" \
  TOKEN_ADDRESS \
  --rpc-url https://sepolia.base.org

# Example: Check FET price (should return 2000000 = $2.00)
cast call 0x114726f91082b788BC828c4B41A0eA03BFF715FB \
  "getPrice(address)(uint256)" \
  0xb9080604ab9ba300458b324e9A851aBbF157b44A \
  --rpc-url https://sepolia.base.org
```

### Check Pending Deposits

```bash
# Get pending deposit details (depositId = 0, 1, 2, ...)
cast call 0xfE33131EDbeC8b1f34550e63B5E63910985F99c6 \
  "pendingDeposits(uint256)(address,uint256,bool,uint256)" \
  DEPOSIT_ID \
  --rpc-url https://sepolia.base.org

# Get next deposit ID
cast call 0xfE33131EDbeC8b1f34550e63B5E63910985F99c6 \
  "nextDepositId()(uint256)" \
  --rpc-url https://sepolia.base.org
```

## Contract Updates (Oct 22, 2025)

This deployment includes several critical improvements:

### SectorVault.sol
- ✅ Added `FulfillmentValueMismatch` error
- ✅ Added value verification in `fulfillDeposit()` function
- ✅ Validates underlying token value matches deposited quote amount
- ✅ Uses oracle prices for accurate value calculation

### Fulfillment Engine
- ✅ Fetches prices from oracle for all tokens
- ✅ Calculates amounts based on price AND weight
- ✅ No hardcoded decimal assumptions (queries dynamically)
- ✅ Handles tokens with different prices correctly
- ✅ Passes contract value verification

## Resources

- [Base Sepolia Explorer](https://sepolia.basescan.org/)
- [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- [Base Documentation](https://docs.base.org/)
- [Foundry Book](https://book.getfoundry.sh/)
