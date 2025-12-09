# TONE Finance - Smart Contracts

On-chain sector tokens (ETF-like baskets) for Base testnet.

## Overview

TONE Finance allows users to invest in sector baskets by depositing a quote token (USDC). An offchain fulfillment engine gathers the underlying tokens and completes deposits, minting sector tokens to users.

## Architecture

### Contracts

- **SectorVault.sol**: Main vault managing deposits, fulfillment, withdrawals, and NAV calculation
- **SectorToken.sol**: ERC20 token representing shares in a sector vault
- **MockOracle.sol**: Price oracle for testing (implements IPriceOracle interface)
- **IPriceOracle.sol**: Interface for price oracles (supports Chainlink, Pyth, etc.)

### Flow

1. **Deposit**: User deposits USDC → Vault creates pending deposit → Emits event
2. **Fulfillment**: Offchain engine buys underlying tokens → Calls `fulfillDeposit()` → Vault calculates shares using NAV → User receives sector tokens → Deposit record cleaned up
3. **Withdrawal**: User burns sector tokens → Receives proportional underlying tokens based on current holdings
4. **NAV Calculation**: Oracle provides real-time prices → Vault calculates total value of holdings → Used for fair share pricing

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
# 1. Deploy 10 mock AI sector tokens (0X0, ARKM, FET, KAITO, NEAR, NOS, PAAL, RENDER, TAO, VIRTUAL)
# 2. Deploy MockOracle and set all token prices to $1.00
# 3. Deploy SectorVault and SectorToken contracts with oracle integration
# 4. Mint 1M tokens of each to the deployer
# 5. If FULFILLMENT_ENGINE is set in .env, transfer 500k of each token to it
# 6. Output all contract addresses including oracle
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

// Update price oracle (e.g., switch from MockOracle to Chainlink)
vault.setOracle(newOracleAddress);

// Update basket composition
address[] memory newTokens = [token1, token2];
uint256[] memory newWeights = [5000, 5000]; // 50% each
vault.updateBasket(newTokens, newWeights);
```

### For Oracle Management

```solidity
// Update token prices in MockOracle (testing only)
mockOracle.setPrice(tokenAddress, priceInUSDC); // Price with 6 decimals

// Batch update prices
address[] memory tokens = [token1, token2, token3];
uint256[] memory prices = [1_000_000, 2_000_000, 500_000]; // $1, $2, $0.50
mockOracle.setPrices(tokens, prices);

// Check current NAV
uint256 totalValue = vault.getTotalValue(); // Returns value in USDC (6 decimals)
```

## NAV (Net Asset Value) Calculation

The vault uses oracle-based NAV calculation for fair share pricing:

### How It Works

1. **Total Value Calculation**:
   ```solidity
   // For each token in the basket:
   value = tokenBalance * oraclePrice
   totalNAV = sum(all token values)
   ```

2. **Share Calculation** (on deposit):
   ```solidity
   // First deposit: 1:1 ratio
   if (totalShares == 0) return depositAmount;

   // Subsequent deposits: proportional to NAV
   shares = (depositAmount * totalShares) / totalNAV
   ```

3. **Example**:
   - Vault holds: 400 TK1, 300 TK2, 300 TK3
   - Oracle prices: TK1=$2, TK2=$2, TK3=$2
   - Total NAV = (400×$2) + (300×$2) + (300×$2) = $2000
   - User deposits $1000 USDC
   - If 1000 shares exist: `shares = (1000 * 1000) / 2000 = 500 shares`

### Benefits

✅ **Fair pricing**: New depositors pay market price
✅ **No dilution**: Existing shareholders maintain proportional value
✅ **Real-time**: NAV updates immediately when oracle prices change
✅ **Transparent**: On-chain calculation using verifiable oracle data

## Contract Addresses (Base Sepolia)

### Shared Infrastructure
- **MockOracle**: [`0x8E6596749b8aDa46195C04e03297469aFA2fd4F3`](https://sepolia.basescan.org/address/0xF6529F44C596fB1c9440F427d1c65b5E1EDfB9c1)
- **Quote Token (USDC)**: [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036cbd53842c5426634e7929541ec2318f3dcf7e)

### AI Sector
- **SectorVault (AI)**: [`0x2eC9856556c6E7cF626542fc620822136d698320`](https://sepolia.basescan.org/address/0xb42704874513Ff4877cD571A747B2b07F0d22D8A)
- **SectorToken (tAI)**: [`0xef303C9eD9eD15606dF2c40a4fFb67907F5631BE`](https://sepolia.basescan.org/address/0x0128A1cAa7b8757B148cDbc454956E64cB620806)

### Made in America Sector
- **SectorVault (USA)**: [`0x368167Fc17EC24906233104c21f3919A8cE43D99`](https://sepolia.basescan.org/address/0x84Ceed008c36afA34DAD94c7bD7F0A3Ba073D464)
- **SectorToken (tUSA)**: [`0x9BF24297bF3bD256a7EA6e840EF6f9B2fA108b88`](https://sepolia.basescan.org/address/0x36a6760a6f88C857525F79e5089962235373F94D)

## Key Features (Alpha)

✅ Two-step deposit flow with offchain fulfillment
✅ **NAV-based share calculation using oracle prices**
✅ **Mock oracle for testing (upgradeable to Chainlink/Pyth)**
✅ **Dynamic price discovery - NAV updates with market prices**
✅ Proportional withdrawals of underlying tokens
✅ Multiple sector vaults support
✅ Access control for fulfillment role
✅ Basket composition updates (add/remove tokens)
✅ Deposit cancellation with refunds
✅ **Automatic deposit cleanup (prevents unbounded storage growth)**
✅ **Settable oracle (can upgrade without redeploying vault)**
✅ Generic oracle interface (IPriceOracle) for easy integration

## Limitations (Alpha)

- Uses MockOracle (not production-ready, needs Chainlink/Pyth integration)
- No rebalancing mechanism
- No fees or management charges
- No deposit caps/limits
- No slippage protection on fulfillment
- No emergency pause mechanism

## Security

⚠️ **Alpha Version - Not Audited**: This is a hackathon/alpha version. Do not use with significant funds.

### Recommendations for Production

- [ ] Full smart contract audit
- [x] Price oracle interface (IPriceOracle) - ✅ Implemented
- [ ] Replace MockOracle with production oracle (Chainlink, Pyth, or custom aggregator)
- [ ] Timelock for admin functions (setOracle, updateBasket)
- [ ] Emergency pause mechanism (circuit breaker)
- [ ] Slippage protection on deposits/withdrawals
- [ ] Fee mechanism for sustainability
- [ ] Gas optimizations review
- [ ] Formal verification
- [ ] Multi-sig ownership for critical functions
- [ ] Rate limiting on oracle updates

## Development

### Project Structure

```
├── src/
│   ├── SectorVault.sol           # Main vault contract with NAV calculation
│   ├── SectorToken.sol           # Sector token (ERC20)
│   ├── MockOracle.sol            # Mock price oracle for testing
│   └── interfaces/
│       └── IPriceOracle.sol      # Generic oracle interface
├── script/
│   └── DeploySectorVault.s.sol   # Deployment script (AI sector)
├── test/
│   └── SectorVault.t.sol         # Comprehensive tests (16 test cases)
└── foundry.toml                  # Foundry config
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
3. **"Invalid price" error**: Ensure all tokens have prices set in the oracle before depositing
4. **Transaction fails**: Check token approvals and balances
5. **Incorrect share calculation**: Verify oracle prices are set correctly (6 decimals for USDC)
6. **NAV is zero**: Set prices in MockOracle using `setPrice()` or `setPrices()`

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
