"use client";

import { SectorConfig } from "@/lib/sectors";
import { useSectorVault, formatTokenAmount, formatTokenAmountTo2Decimals, useTokenMetadata, useTargetWeight } from "@/lib/hooks/useMultiSectorVault";
import { AddTokenButton } from "./AddTokenButton";
import styles from "./Card.module.css";

interface SectorVaultInfoProps {
  sector: SectorConfig;
}

function TokenRow({ sector, address, balance }: { sector: SectorConfig; address: string; balance: bigint }) {
  const token = useTokenMetadata(address);
  const weight = useTargetWeight(sector, address);
  const symbol = token.symbol ?? "...";
  const decimals = token.decimals ?? 18;

  // Convert weight from basis points (10000 = 100%) to percentage
  const weightPercent = weight ? (Number(weight) / 100).toFixed(1) : null;

  return (
    <div className={styles.tokenItem}>
      <span className={styles.tokenSymbol}>
        {symbol}
        {weightPercent && (
          <span className={styles.tokenWeight}>
            ({weightPercent}%)
          </span>
        )}
      </span>
      <span className={styles.tokenBalance}>
        {formatTokenAmount(balance, decimals)}
      </span>
    </div>
  );
}

export function SectorVaultInfo({ sector }: SectorVaultInfoProps) {
  const { totalSupply, totalValue, vaultBalances, underlyingTokens } = useSectorVault(sector);

  // Fetch dynamic token metadata from sector configuration
  const sectorToken = useTokenMetadata(sector.tokenAddress);
  const quoteToken = useTokenMetadata(sector.quoteTokenAddress);

  const sectorDecimals = sectorToken.decimals ?? 18;
  const sectorSymbol = sectorToken.symbol ?? "Sector Token";
  const quoteSymbol = quoteToken.symbol ?? "USDC";
  const quoteDecimals = quoteToken.decimals ?? 6;

  return (
    <div className={styles.infoCard}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        {sector.icon && (
          <span style={{ fontSize: "32px" }}>{sector.icon}</span>
        )}
        <h2>{sectorToken.name || sector.name}</h2>
      </div>

      <div className={styles.statGrid}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Supply</span>
          <span className={styles.statValue} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatTokenAmountTo2Decimals(totalSupply, sectorDecimals)} {sectorSymbol}
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Value Locked (TVL)</span>
          <span className={styles.statValue} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatTokenAmountTo2Decimals(totalValue, quoteDecimals)} {quoteSymbol}
          </span>
        </div>
      </div>

      {vaultBalances && underlyingTokens && (
        <div className={styles.tokenList}>
          <h3>Basket Composition</h3>
          {vaultBalances[0]?.map((tokenAddress: string, index: number) => (
            <TokenRow
              key={tokenAddress}
              sector={sector}
              address={tokenAddress}
              balance={vaultBalances[1][index]}
            />
          ))}
        </div>
      )}

      <p className={styles.description} style={{ marginTop: "20px", marginBottom: 0 }}>
        {sector.description}
      </p>

      <AddTokenButton />
    </div>
  );
}
