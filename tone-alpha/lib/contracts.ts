import SectorVaultABI from "../contracts/SectorVault.json";
import SectorTokenABI from "../contracts/SectorToken.json";
import ERC20ABI from "../contracts/ERC20.json";

// Contract addresses on Base Sepolia
// Deployed on Base Sepolia testnet
export const CONTRACTS = {
  SECTOR_VAULT: "0x70E6a36bb71549C78Cd9c9f660B0f67B13B3f772",
  SECTOR_TOKEN: "0xD3faFD3196ffE8830B3992AEED222c3Ce33B174A",
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
} as const;

// ABIs
export const ABIS = {
  SectorVault: SectorVaultABI,
  SectorToken: SectorTokenABI,
  ERC20: ERC20ABI,
} as const;

// Contract configs for wagmi
export const sectorVaultConfig = {
  address: CONTRACTS.SECTOR_VAULT as `0x${string}`,
  abi: ABIS.SectorVault,
} as const;

export const sectorTokenConfig = {
  address: CONTRACTS.SECTOR_TOKEN as `0x${string}`,
  abi: ABIS.SectorToken,
} as const;

export const usdcConfig = {
  address: CONTRACTS.USDC as `0x${string}`,
  abi: ABIS.ERC20,
} as const;
