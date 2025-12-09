# TONE Finance - Fulfillment Engine

A Go-based fulfillment engine for TONE Finance sector vaults. Supports **multiple vaults** simultaneously, listening for deposit and withdrawal events and automatically fulfilling them.

## Features

- ✅ **Multi-vault support** - manage multiple sector vaults with a single engine instance
- ✅ Listens for `DepositRequested` and `WithdrawalRequested` events from SectorVault contracts
- ✅ **Dynamically fetches** underlying tokens and weights from each vault
- ✅ Automatically calculates underlying token amounts based on basket weights
- ✅ Approves and transfers underlying tokens to the vault (for deposits)
- ✅ Handles USDC transfers back to users (for withdrawals)
- ✅ Calls `fulfillDeposit` and `fulfillWithdrawal` on the vault contracts
- ✅ **Automatic pending request handling** - checks and fulfills any pending deposits/withdrawals on startup
- ✅ Block-based polling (no websocket dependencies)
- ✅ Graceful shutdown handling with in-flight operation tracking

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

# Multi-vault configuration - Option 1: Named vaults (RECOMMENDED)
SECTOR_VAULT_AI=0xYOUR_AI_VAULT_ADDRESS
SECTOR_VAULT_MIA=0xYOUR_MIA_VAULT_ADDRESS

# Alternative: Comma-separated list
# SECTOR_VAULTS=0xVault1,0xVault2,0xVault3

# Legacy: Single vault (for backward compatibility)
# SECTOR_VAULT=0xYOUR_VAULT_ADDRESS_HERE

# Polling interval in seconds (12 seconds = ~1 block on Base)
POLL_INTERVAL=12
```

**Multi-Vault Configuration:**

The engine supports three ways to configure vaults:

1. **Named vaults** (recommended for clarity):
   ```env
   SECTOR_VAULT_AI=0x...
   SECTOR_VAULT_MIA=0x...
   SECTOR_VAULT_DEFI=0x...
   ```
   Supported names: `AI`, `MIA`, `DEFI`, `GAMING`, `MEME`

2. **Comma-separated list**:
   ```env
   SECTOR_VAULTS=0xVault1Address,0xVault2Address,0xVault3Address
   ```

3. **Single vault** (legacy):
   ```env
   SECTOR_VAULT=0xYourVaultAddress
   ```

The engine checks for named vaults first, then `SECTOR_VAULTS`, then falls back to `SECTOR_VAULT`.

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

1. **Multi-Vault Initialization**:
   - Loads all configured vaults from environment variables
   - Creates a separate fulfiller and event listener for each vault
   - Each vault runs independently in its own goroutine

2. **Pending Request Check** (per vault):
   - Queries each contract for total number of deposits (`nextDepositId`) and withdrawals (`nextWithdrawalId`)
   - Checks each request to see if it's fulfilled
   - Automatically fulfills any pending deposits or withdrawals

3. **Continuous Polling** (per vault):
   - Every 12 seconds (configurable), queries for new `DepositRequested` and `WithdrawalRequested` events
   - Extracts request IDs and amounts from events
   - Processes requests concurrently across all vaults

### For Each Deposit

4. **Token Calculation**: Calculates underlying token amounts based on basket weights fetched from the vault
5. **Approval**: Approves each underlying token for the vault to spend (once per token with max approval)
6. **Fulfillment**: Calls `fulfillDeposit()` with the calculated amounts
7. **Confirmation**: Waits for transaction confirmation and logs success

### For Each Withdrawal

4. **Value Calculation**: Fetches the expected USDC value from the vault's oracle
5. **USDC Approval**: Approves USDC for the vault to spend (if not already approved)
6. **Fulfillment**: Calls `fulfillWithdrawal()` which transfers USDC to the user
7. **Confirmation**: Waits for transaction confirmation and logs success

## Example Output

```
🚀 TONE Finance - Fulfillment Engine
=====================================

INFO TONE Finance - Fulfillment Engine starting vault_count=2
INFO Fulfiller wallet initialized address=0x2667A044315Cea7A4FC42Ea7E851FC276ADc5B0F

INFO Initializing vault vault_name=AI vault_address=0x496c491D1E4fc8E563B212b143106732404D9CeE
INFO Fulfiller initialized for vault vault_name=AI vault_address=0x496c491D1E4fc8E563B212b143106732404D9CeE underlying_tokens=10

INFO Initializing vault vault_name=MIA vault_address=0x7B3a8E12D4e5F6C8b9A1C2D3E4F5a6B7C8D9E0F1
INFO Fulfiller initialized for vault vault_name=MIA vault_address=0x7B3a8E12D4e5F6C8b9A1C2D3E4F5a6B7C8D9E0F1 underlying_tokens=10

INFO Starting event listener vault_name=AI
INFO Scanning for pending deposits on startup
INFO Scanning for pending withdrawals on startup
INFO Event listener started vault_name=AI start_block=32339825

INFO Starting event listener vault_name=MIA
INFO Scanning for pending deposits on startup
INFO Found pending deposit deposit_id=0 user=0xabcd... quote_amount=10000000
INFO Starting deposit fulfillment deposit_id=0 quote_amount=10000000
INFO Deposit fulfilled successfully deposit_id=0 tx_hash=0x123...
INFO Event listener started vault_name=MIA start_block=32339825

INFO All event listeners started successfully

🔍 Both vaults polling every 12 seconds...
⏳ Processing deposits and withdrawals concurrently
```

## Configuration

### Dynamic Basket Configuration

The fulfillment engine **automatically fetches** the basket configuration from each vault on startup:
- Underlying token addresses
- Target weights for each token (in basis points, sum = 10000)
- Oracle address and decimals
- Quote token (USDC) address and decimals

This means the engine adapts to any vault configuration without code changes. When you update the basket in a vault, simply restart the fulfillment engine to pick up the new configuration.

**Note:** Shared tokens (like BAT in both AI and MIA sectors) are handled efficiently - the engine will reuse approvals across vaults.

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
