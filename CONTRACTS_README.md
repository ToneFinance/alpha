# TONE Finance - Smart Contracts

On-chain sector tokens (ETF-like baskets) for Base testnet.

## Overview

TONE Finance allows users to invest in sector baskets by depositing a quote token (USDC). An offchain fulfillment engine gathers the underlying tokens and completes deposits, minting sector tokens to users.

## Architecture

### Contracts

- **SectorVault.sol**: Main vault managing deposits, fulfillment, and withdrawals
- **SectorToken.sol**: ERC20 token representing shares in a sector vault

### Flow

1. **Deposit**: User deposits USDC → Vault creates pending deposit → Emits event
2. **Fulfillment**: Offchain engine buys underlying tokens → Calls `fulfillDeposit()` → User receives sector tokens
3. **Withdrawal**: User burns sector tokens → Receives proportional underlying tokens

## Setup

### Prerequisites

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies (already done if you cloned)
forge install
```

### Environment Setup

```bash
# Copy example env file
cp .env.example .env

# Edit .env and add:
# - PRIVATE_KEY: Your deployment wallet private key (without 0x)
# - BASESCAN_API_KEY: API key from basescan.org for verification
# - FULFILLMENT_ENGINE: (Optional) Address to receive mock tokens and fulfill deposits
```

## Build & Test

```bash
# Compile contracts
forge build

# Run tests
forge test

# Run tests with gas report
forge test --gas-report

# Run tests with verbosity
forge test -vvv
```

## Deployment

### Deploy to Base Sepolia

```bash
# Deploy vault with mock tokens (for alpha testing)
forge script script/DeploySectorVault.s.sol:DeploySectorVault \
  --rpc-url base_sepolia \
  --broadcast \
  --verify

# Deployment will:
# 1. Deploy SectorVault and SectorToken contracts
# 2. Deploy 3 mock ERC20 tokens (WETH, UNI, AAVE)
# 3. Mint 1M tokens of each to the deployer
# 4. If FULFILLMENT_ENGINE is set in .env, transfer 500k of each token to it
# 5. Output all contract addresses
```

### Verify Contracts (if not auto-verified)

```bash
forge verify-contract <CONTRACT_ADDRESS> \
  src/SectorVault.sol:SectorVault \
  --chain base-sepolia \
  --watch
```

## Usage

### For Users

1. **Deposit**:
   ```solidity
   // Approve USDC
   IERC20(usdc).approve(vaultAddress, amount);

   // Deposit
   uint256 depositId = vault.deposit(amount);
   ```

2. **Withdraw**:
   ```solidity
   // Withdraw by burning sector tokens
   vault.withdraw(sharesAmount);
   ```

3. **Cancel Pending Deposit**:
   ```solidity
   vault.cancelDeposit(depositId);
   ```

### For Fulfillment Engine

```solidity
// Prepare underlying tokens according to basket weights
uint256[] memory amounts = [token1Amount, token2Amount, token3Amount];

// Approve tokens
IERC20(token1).approve(vaultAddress, amounts[0]);
IERC20(token2).approve(vaultAddress, amounts[1]);
IERC20(token3).approve(vaultAddress, amounts[2]);

// Fulfill deposit
vault.fulfillDeposit(depositId, amounts);
```

### For Admin

```solidity
// Update fulfillment role
vault.setFulfillmentRole(newAddress);

// Update basket composition
address[] memory newTokens = [token1, token2];
uint256[] memory newWeights = [5000, 5000]; // 50% each
vault.updateBasket(newTokens, newWeights);
```

## Contract Addresses (Base Sepolia)

> Update after deployment

- **SectorVault**: `TBD`
- **SectorToken**: `TBD`
- **Quote Token (USDC)**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Key Features (Alpha)

✅ Two-step deposit flow with offchain fulfillment
✅ Proportional withdrawals of underlying tokens
✅ Multiple sector vaults support
✅ Access control for fulfillment role
✅ Basket composition updates
✅ Deposit cancellation

## Limitations (Alpha)

- No price oracles (assumes fixed ratios)
- No rebalancing mechanism
- No fees
- No deposit caps/limits
- Simplified share calculation

## Security

⚠️ **Alpha Version - Not Audited**: This is a hackathon/alpha version. Do not use with significant funds.

### Recommendations for Production

- [ ] Full smart contract audit
- [ ] Price oracle integration (Chainlink, Pyth)
- [ ] Timelock for admin functions
- [ ] Emergency pause mechanism
- [ ] Slippage protection
- [ ] Gas optimizations
- [ ] Formal verification

## Development

### Project Structure

```
├── src/
│   ├── SectorVault.sol      # Main vault contract
│   └── SectorToken.sol      # Sector token (ERC20)
├── script/
│   └── DeploySectorVault.s.sol  # Deployment script
├── test/
│   └── SectorVault.t.sol    # Comprehensive tests
└── foundry.toml             # Foundry config
```

### Adding New Tests

```solidity
// test/YourTest.t.sol
import {Test} from "forge-std/Test.sol";
import {SectorVault} from "../src/SectorVault.sol";

contract YourTest is Test {
    function setUp() public { /* ... */ }
    function testYourFeature() public { /* ... */ }
}
```

## Troubleshooting

### Common Issues

1. **"Invalid weights" error**: Ensure target weights sum to exactly 10000 (100%)
2. **"Unauthorized fulfillment"**: Only the fulfillment role can call `fulfillDeposit()`
3. **Transaction fails**: Check token approvals and balances

### Gas Estimation

- Deploy Vault: ~3-4M gas
- Deposit: ~150k gas
- Fulfill Deposit: ~400k gas
- Withdraw: ~500k gas

## Resources

- [Foundry Book](https://book.getfoundry.sh/)
- [Base Documentation](https://docs.base.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)

## License

MIT
