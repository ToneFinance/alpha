import SectorVaultABI from "../contracts/SectorVault.json";
import SectorTokenABI from "../contracts/SectorToken.json";
import ERC20ABI from "../contracts/ERC20.json";

// Contract addresses on Base Sepolia
// Deployed on Base Sepolia testnet
export const CONTRACTS = {
  SECTOR_VAULT: "0xdf3237C2EA87B7CB2B1e5D39E27765925aec4F96",
  SECTOR_TOKEN: "0x71Ad6e213E3fe312E0aF4d93005F139951a15Dd3",
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
