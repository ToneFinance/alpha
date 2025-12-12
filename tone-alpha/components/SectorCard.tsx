"use client";

import Link from "next/link";
import { SectorConfig } from "@/lib/sectors";
import { useSectorVault, useTokenMetadata, formatTokenAmountTo2Decimals } from "@/lib/hooks/useMultiSectorVault";
import { TokenLogo } from "@/components/TokenLogo";
import { ArrowRight } from "lucide-react";
import styles from "./SectorCard.module.css";

interface SectorCardProps {
  sector: SectorConfig;
}

export function SectorCard({ sector }: SectorCardProps) {
  const { totalSupply, totalValue } = useSectorVault(sector);
  const sectorToken = useTokenMetadata(sector.tokenAddress);
  const quoteToken = useTokenMetadata(sector.quoteTokenAddress);

  const sectorDecimals = sectorToken.decimals ?? 18;
  const sectorSymbol = sectorToken.symbol ?? "...";
  const quoteDecimals = quoteToken.decimals ?? 6;
  const quoteSymbol = quoteToken.symbol ?? "USDC";

  return (
    <Link href={`/sectors/${sector.id}`} className={styles.sectorCard}>
      <div className={styles.cardHeader}>
        <TokenLogo symbol={sector.symbol || "T"} color={sector.color} size="md" />
        <div className={styles.headerContent}>
          <h3 className={styles.sectorName}>{sector.name}</h3>
          <p className={styles.sectorDescription}>{sector.description}</p>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Supply</span>
          <span className={styles.statValue} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatTokenAmountTo2Decimals(totalSupply, sectorDecimals)} {sectorSymbol}
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>TVL</span>
          <span className={styles.statValue} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatTokenAmountTo2Decimals(totalValue, quoteDecimals)} {quoteSymbol}
          </span>
        </div>
      </div>

      <div className={styles.cardFooter}>
        <span className={styles.viewDetails}>
          View Details <ArrowRight size={16} />
        </span>
      </div>

      {!sector.isActive && (
        <div className={styles.comingSoonBadge}>Coming Soon</div>
      )}
    </Link>
  );
}
