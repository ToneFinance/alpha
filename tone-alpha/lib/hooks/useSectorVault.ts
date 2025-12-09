/**
 * @deprecated This file is deprecated. Please use useMultiSectorVault.ts instead.
 *
 * The old hooks in this file assumed a single sector vault.
 * New code should use the multi-sector hooks from useMultiSectorVault.ts
 * which accept a SectorConfig parameter to work with any sector.
 *
 * Migration guide:
 * - Import from "./useMultiSectorVault" instead of "./useSectorVault"
 * - Pass a sector configuration from sectors.ts to each hook
 * - Example:
 *   const sector = getSectorById("ai");
 *   const { quoteTokenBalance } = useSectorVault(sector);
 */

// Re-export everything from useMultiSectorVault for backward compatibility
export * from "./useMultiSectorVault";
