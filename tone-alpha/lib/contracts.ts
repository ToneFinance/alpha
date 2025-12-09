import SectorVaultABI from "../contracts/SectorVault.json";
import SectorTokenABI from "../contracts/SectorToken.json";
import ERC20ABI from "../contracts/ERC20.json";
import { SectorConfig } from "./sectors";

/**
 * Contract addresses on Base Sepolia
 * Deployed on Base Sepolia testnet - December 9, 2025
 *
 * For multi-sector support, use sectors.ts to get sector-specific addresses
 * This file now only exports ABIs and utility functions
 */
export const CONTRACTS = {
  // Shared infrastructure
  ORACLE: "0x8E6596749b8aDa46195C04e03297469aFA2fd4F3" as `0x${string}`,
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`, // Base Sepolia USDC
} as const;

// ABIs for contract interactions
export const ABIS = {
  SectorVault: SectorVaultABI,
  SectorToken: SectorTokenABI,
  ERC20: ERC20ABI,
} as const;

/**
 * Get contract config for a specific sector's vault
 * @param sector - The sector configuration
 * @returns wagmi contract config for the sector vault
 */
export function getSectorVaultConfig(sector: SectorConfig) {
  return {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;
}

/**
 * Get contract config for a specific sector's token
 * @param sector - The sector configuration
 * @returns wagmi contract config for the sector token
 */
export function getSectorTokenConfig(sector: SectorConfig) {
  return {
    address: sector.tokenAddress,
    abi: ABIS.SectorToken,
  } as const;
}

/**
 * Get contract config for the quote token (USDC)
 * @returns wagmi contract config for USDC
 */
export function getQuoteTokenConfig() {
  return {
    address: CONTRACTS.USDC,
    abi: ABIS.ERC20,
  } as const;
}

/**
 * Get contract config for any ERC20 token
 * @param tokenAddress - The token address
 * @returns wagmi contract config for the token
 */
export function getERC20Config(tokenAddress: `0x${string}`) {
  return {
    address: tokenAddress,
    abi: ABIS.ERC20,
  } as const;
}
