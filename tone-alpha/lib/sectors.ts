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
  icon?: string; // Optional icon/emoji
  isActive: boolean;
}

// All configured sectors
export const SECTORS: Record<string, SectorConfig> = {
  defi: {
    id: "defi",
    name: "DeFi Sector",
    description: "Diversified basket of leading DeFi protocols including lending, DEXs, and derivatives platforms",
    vaultAddress: "0x70E6a36bb71549C78Cd9c9f660B0f67B13B3f772",
    tokenAddress: "0xD3faFD3196ffE8830B3992AEED222c3Ce33B174A",
    quoteTokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    color: "#667eea",
    icon: "🏦",
    isActive: true,
  },
  // Example: Additional sectors can be added here
  // infrastructure: {
  //   id: "infrastructure",
  //   name: "Infrastructure Sector",
  //   description: "Layer-1/Layer-2 blockchains and infrastructure protocols",
  //   vaultAddress: "0x...",
  //   tokenAddress: "0x...",
  //   quoteTokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  //   color: "#764ba2",
  //   icon: "⚡",
  //   isActive: false, // Coming soon
  // },
  // gaming: {
  //   id: "gaming",
  //   name: "Gaming & Metaverse",
  //   description: "Gaming tokens, NFT platforms, and metaverse projects",
  //   vaultAddress: "0x...",
  //   tokenAddress: "0x...",
  //   quoteTokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  //   color: "#f093fb",
  //   icon: "🎮",
  //   isActive: false,
  // },
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
 * Default sector (used for backward compatibility)
 */
export const DEFAULT_SECTOR = SECTORS.defi;
