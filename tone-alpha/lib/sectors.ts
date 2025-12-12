/**
 * Sector configuration and metadata
 * Each sector represents a different investment strategy/basket
 */

export interface SectorConfig {
  id: string;
  name: string;
  description: string;
  vaultAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  quoteTokenAddress: `0x${string}`;
  color: string; // For UI theming
  symbol?: string; // Token symbol for logo display
  isActive: boolean;
}

// All configured sectors
export const SECTORS: Record<string, SectorConfig> = {
  ai: {
    id: "ai",
    name: "AI Sector",
    description: "Diversified basket of leading AI and machine learning tokens including compute, data, and AI agent protocols",
    vaultAddress: "0x2eC9856556c6E7cF626542fc620822136d698320",
    tokenAddress: "0xef303C9eD9eD15606dF2c40a4fFb67907F5631BE",
    quoteTokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    color: "#3b82f6",
    symbol: "tAI",
    isActive: true,
  },
  usa: {
    id: "usa",
    name: "Made in America",
    description: "Made in America sector featuring top US-based and US-friendly crypto projects",
    vaultAddress: "0x368167Fc17EC24906233104c21f3919A8cE43D99",
    tokenAddress: "0x9BF24297bF3bD256a7EA6e840EF6f9B2fA108b88",
    quoteTokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    color: "#ef4444",
    symbol: "tUSA",
    isActive: true,
  },
} as const;

/**
 * Get all active sectors
 */
export function getActiveSectors(): SectorConfig[] {
  return Object.values(SECTORS).filter(sector => sector.isActive);
}

/**
 * Get all sectors (including inactive)
 */
export function getAllSectors(): SectorConfig[] {
  return Object.values(SECTORS);
}

/**
 * Get a specific sector by ID
 */
export function getSectorById(id: string): SectorConfig | undefined {
  return SECTORS[id];
}

/**
 * Get sector configuration for contracts
 */
export function getSectorContracts(sectorId: string) {
  const sector = getSectorById(sectorId);
  if (!sector) {
    throw new Error(`Sector ${sectorId} not found`);
  }

  return {
    vaultAddress: sector.vaultAddress,
    tokenAddress: sector.tokenAddress,
    quoteTokenAddress: sector.quoteTokenAddress,
  };
}

/**
 * Get the first active sector (useful for initial UI state)
 * Note: For multi-sector UIs, components should allow sector selection
 */
export function getFirstActiveSector(): SectorConfig {
  const active = getActiveSectors();
  if (active.length === 0) {
    throw new Error("No active sectors found");
  }
  return active[0];
}
