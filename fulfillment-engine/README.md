# TONE Finance - Fulfillment Engine

A simple Go-based fulfillment engine for the TONE Finance sector vault. Listens for deposit events and automatically fulfills them by providing the underlying tokens.

## Features

- ✅ Listens for `DepositRequested` events from the SectorVault contract
- ✅ **Dynamically fetches** underlying tokens and weights from the vault
- ✅ Automatically calculates underlying token amounts based on basket weights
- ✅ Approves and transfers underlying tokens to the vault
- ✅ Calls `fulfillDeposit` on the vault contract
- ✅ **Automatic pending deposit handling** - checks and fulfills any pending deposits on startup
- ✅ Block-based polling (no websocket dependencies)
- ✅ Graceful shutdown handling

## Prerequisites

- Go 1.21 or higher
- Private key with:
  - Base Sepolia ETH for gas
  - Sufficient underlying tokens (fetched automatically from vault)
  - Fulfillment role on the SectorVault contract

## Setup

### 1. Install Dependencies

```bash
cd fulfillment-engine
go mod download
```

### 2. Configure Environment

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
# Your fulfiller wallet private key (must have 0x prefix)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# Base Sepolia RPC (default is fine)
RPC_URL=https://sepolia.base.org

# Sector Vault contract address
# Underlying tokens and weights are fetched automatically from the vault
SECTOR_VAULT=0xYOUR_VAULT_ADDRESS_HERE

# Polling interval in seconds (12 seconds = ~1 block on Base)
POLL_INTERVAL=12
```

### 3. Ensure Wallet is Funded

Your fulfiller wallet needs:

```bash
# Check ETH balance
cast balance YOUR_ADDRESS --rpc-url https://sepolia.base.org

# Check token balances (replace TOKEN_ADDRESS with actual token addresses from vault)
cast call TOKEN_ADDRESS "balanceOf(address)(uint256)" YOUR_ADDRESS --rpc-url https://sepolia.base.org
```

**Note**: The fulfillment engine automatically detects which tokens are needed from the vault configuration. Ensure your wallet has sufficient balance of all underlying tokens in the basket.

If you need tokens and you're the deployer, you can transfer from the deployment wallet:

```bash
# From the contract directory
source .env
cast send TOKEN_ADDRESS "transfer(address,uint256)" YOUR_FULFILLER_ADDRESS AMOUNT --rpc-url https://sepolia.base.org --private-key $PRIVATE_KEY
```

## Running the Engine

### Development Mode

```bash
go run .
```

### Build and Run

```bash
# Build
go build -o fulfillment-engine

# Run
./fulfillment-engine
```

## How It Works

### On Startup

1. **Pending Deposit Check**:
   - Queries the contract for total number of deposits (`nextDepositId`)
   - Checks each deposit to see if it's fulfilled
   - Automatically fulfills any pending deposits

2. **Continuous Polling**:
   - Every 12 seconds (configurable), queries for new `DepositRequested` events
   - Extracts deposit ID and quote amount from events

### For Each Deposit

3. **Token Calculation**: Calculates underlying token amounts based on basket weights fetched from the vault
4. **Approval**: Approves each underlying token for the vault to spend (once per token with max approval)
5. **Fulfillment**: Calls `fulfillDeposit()` with the calculated amounts
6. **Confirmation**: Waits for transaction confirmation and logs success

## Example Output

```
🚀 TONE Finance - Fulfillment Engine
=====================================

✅ Fulfillment engine initialized
📍 Fulfiller address: 0x2667A044315Cea7A4FC42Ea7E851FC276ADc5B0F
🏦 Vault address: 0x496c491D1E4fc8E563B212b143106732404D9CeE

🔍 Checking for pending deposits...
📊 Found 3 total deposit(s), checking status...

🔔 Found pending deposit #1
   User: 0xabcd...
   Quote Amount: 10000000

🔄 Fulfilling deposit #1
💵 Quote amount: 10000000
📊 Underlying amounts calculated based on vault basket
  ✓ Approved token 0x12CF3c...: 0x123...
  ✓ Approved token 0x5C37E9...: 0x456...
  ✓ Approved token 0x2243c9...: 0x789...
  ✓ Fulfilled deposit: 0xabc...123
✅ Deposit #1 fulfilled successfully!

✓ Fulfilled 1 pending deposit(s)

🎯 Starting event listener from block 32339825
⏰ Polling every 12 seconds

🔍 Checking blocks 32339826 to 32339838
⏳ No new blocks (current: 32339838)
```

## Configuration

### Dynamic Basket Configuration

The fulfillment engine **automatically fetches** the basket configuration from the vault on startup:
- Underlying token addresses
- Target weights for each token (in basis points, sum = 10000)

This means the engine adapts to any vault configuration without code changes. When you update the basket in the vault, simply restart the fulfillment engine to pick up the new configuration.

### Polling Interval

Adjust `POLL_INTERVAL` in `.env` to change how often the engine checks for new events:
- 12 seconds = ~1 block on Base Sepolia (recommended)
- Lower values = faster detection but more RPC calls
- Higher values = less RPC usage but slower detection

### Automatic Pending Deposit Handling

On every startup, the engine automatically:
- Queries the contract for the total number of deposits
- Checks each deposit to see if it's already fulfilled
- Automatically fulfills any pending deposits

This means:
- **First time running**: All existing pending deposits will be fulfilled automatically
- **After downtime**: Any deposits missed during downtime will be caught and fulfilled
- **No configuration needed**: Works out of the box

**Note**: For vaults with many deposits, the initial scan may take a moment as it queries each deposit individually.

## Troubleshooting

### "Failed to load config: PRIVATE_KEY not set"
Make sure your `.env` file exists and contains `PRIVATE_KEY` with the `0x` prefix.

### "Invalid private key"
Ensure your private key is valid and starts with `0x`.

### "Insufficient funds"
Your fulfiller wallet needs Base Sepolia ETH for gas and sufficient balance of all underlying tokens in the vault's basket.

### "Transaction failed"
Check that:
- Your address is set as the `fulfillmentRole` on the vault
- You have approved sufficient token amounts
- The deposit hasn't already been fulfilled

## Architecture

```
main.go          - Entry point, handles shutdown
config.go        - Loads configuration from .env
contracts.go     - Contract ABIs and event definitions
fulfiller.go     - Core fulfillment logic (approve + fulfill)
listener.go      - Event polling and handling
```

## Security Notes

⚠️ **This is an alpha implementation for testnet use only**

- Private keys are stored in `.env` (ensure it's gitignored)
- No encryption at rest
- No transaction retry logic
- No advanced error recovery
- Not production-ready

For production, consider:
- Hardware wallet / KMS integration
- Transaction monitoring and retries
- Gas price optimization
- Multi-signature requirements
- Comprehensive error handling
- Monitoring and alerting

## License

MIT
