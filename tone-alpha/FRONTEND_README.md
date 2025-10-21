# TONE Finance - Frontend

On-chain sector token (ETF-like) platform built on Base with Next.js and OnchainKit.

## Overview

TONE Finance allows users to invest in diversified crypto sectors by depositing USDC and receiving sector tokens that represent a basket of underlying assets.

## Setup

### Prerequisites

- Node.js 18+ and npm
- Deployed smart contracts on Base Sepolia (see `../CONTRACTS_README.md`)

### Installation

```bash
# Install dependencies
npm install
```

### Configuration

1. **Update Contract Addresses**

   After deploying contracts, update `lib/contracts.ts`:

   ```typescript
   export const CONTRACTS = {
     SECTOR_VAULT: "0xYourVaultAddress",
     SECTOR_TOKEN: "0xYourTokenAddress",
     USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
   };
   ```

2. **Environment Variables** (Optional)

   Create `.env.local`:

   ```bash
   NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_api_key_here
   ```

   Get your OnchainKit API key from [Coinbase Developer Platform](https://portal.cdp.coinbase.com/products/onchainkit).

## Development

```bash
# Start development server
npm run dev

# Open http://localhost:3000
```

## Features

### User Interface

- **Wallet Connection**: OnchainKit Wallet component for seamless Base Sepolia connection
- **Deposit Flow**: Deposit USDC → Approve → Deposit → Wait for fulfillment
- **Withdraw Flow**: Burn sector tokens → Receive proportional underlying tokens
- **Vault Info**: Real-time vault statistics and basket composition

### Components

- `DepositCard.tsx` - USDC deposit interface
- `WithdrawCard.tsx` - Sector token withdrawal interface
- `VaultInfo.tsx` - Vault statistics display

### Hooks

- `useSectorVault()` - Read vault data and user balances
- `useApproveUsdc()` - Approve USDC spending
- `useDeposit()` - Create deposit requests
- `useWithdraw()` - Withdraw underlying tokens

## Usage Flow

### For Users

1. **Connect Wallet**: Click "Connect Wallet" and select your wallet
2. **Get Testnet USDC**: Get USDC from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
3. **Deposit**:
   - Enter USDC amount
   - Approve USDC spending
   - Confirm deposit transaction
   - Wait for fulfillment engine to process
4. **Monitor**: Check your sector token balance
5. **Withdraw**:
   - Enter sector token amount to burn
   - Confirm withdrawal
   - Receive underlying tokens proportionally

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Blockchain**: Base Sepolia (testnet)
- **Web3 Library**: wagmi v2 + viem v2
- **UI Components**: OnchainKit
- **Styling**: CSS Modules

## Project Structure

```
tone-alpha/
├── app/
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Main dashboard page
│   ├── rootProvider.tsx    # OnchainKit provider config
│   └── globals.css         # Global styles
├── components/
│   ├── DepositCard.tsx     # Deposit UI
│   ├── WithdrawCard.tsx    # Withdraw UI
│   ├── VaultInfo.tsx       # Vault statistics
│   └── Card.module.css     # Component styles
├── lib/
│   ├── contracts.ts        # Contract addresses & ABIs
│   └── hooks/
│       └── useSectorVault.ts  # Contract interaction hooks
└── contracts/
    ├── SectorVault.json    # Vault ABI
    ├── SectorToken.json    # Token ABI
    └── ERC20.json          # ERC20 ABI
```

## Troubleshooting

### Common Issues

1. **"Connect Wallet" not working**
   - Make sure you're on Base Sepolia network
   - Try clearing cache and reconnecting

2. **Transaction fails**
   - Check you have enough USDC and ETH for gas
   - Verify contract addresses are correct in `lib/contracts.ts`

3. **Balance shows 0**
   - Wait for deposits to be fulfilled by the fulfillment engine
   - Check transaction on [Base Sepolia Explorer](https://sepolia.basescan.org/)

## Resources

- [OnchainKit Docs](https://docs.base.org/onchainkit/)
- [Base Docs](https://docs.base.org/)
- [Wagmi Docs](https://wagmi.sh/)

## License

MIT
