"use client";

import { useEffect } from "react";
import { SectorConfig } from "@/lib/sectors";
import { StatCard } from "@/components/StatCard";
import { ToneChart } from "@/components/ToneChart";
import { BasketComposition } from "@/components/BasketComposition";
import { TradePanel } from "@/components/TradePanel";
import { TokenLogo } from "@/components/TokenLogo";
import { useSectorVault, useTokenMetadata, formatTokenAmountTo2Decimals } from "@/lib/hooks/useMultiSectorVault";
import { sdk } from "@farcaster/miniapp-sdk";
import styles from "./page.module.css";

interface SectorDetailClientProps {
  sector: SectorConfig;
}

export function SectorDetailClient({ sector }: SectorDetailClientProps) {
  const { totalSupply, totalValue } = useSectorVault(sector);
  const sectorToken = useTokenMetadata(sector.tokenAddress);
  const quoteToken = useTokenMetadata(sector.quoteTokenAddress);

  const sectorDecimals = sectorToken.decimals ?? 18;
  const sectorSymbol = sectorToken.symbol ?? "...";
  const quoteDecimals = quoteToken.decimals ?? 6;
  const quoteSymbol = quoteToken.symbol ?? "USDC";

  // Calculate price per token: TVL / Total Supply
  // Example: TVL = 229.89 USDC (229890000 with 6 decimals)
  //          Supply = 225.88 tokens (225880000000000000000 with 18 decimals)
  // We want: 229.89 / 225.88 = ~1.017 USDC per token
  //
  // To avoid precision loss with bigint division:
  // (TVL * 10^18) / Supply gives us the price scaled by 10^6 (since TVL has 6 decimals)
  const pricePerToken = totalSupply && totalSupply > 0n && totalValue && totalValue > 0n
    ? (totalValue * BigInt(10 ** sectorDecimals)) / totalSupply
    : 0n;

  useEffect(() => {
    sdk.actions.ready();
  }, []);

  // If sector is not active yet, show coming soon message
  if (!sector.isActive) {
    return (
      <div className={styles.container}>
        <div className={styles.comingSoon}>
          <TokenLogo symbol={sector.symbol || "T"} color={sector.color} size="lg" />
          <h1>{sector.name}</h1>
          <p>{sector.description}</p>
          <div className={styles.comingSoonBadge}>Coming Soon</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Compact Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <TokenLogo symbol={sector.symbol || "T"} color={sector.color} size="md" />
          <div>
            <h1 className={styles.title}>{sector.name}</h1>
            <p className={styles.description}>{sector.description}</p>
          </div>
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className={styles.statsGrid}>
        <StatCard
          label="Total Value Locked"
          value={`$${formatTokenAmountTo2Decimals(totalValue, quoteDecimals)}`}
          subValue={`${quoteSymbol}`}
        />
        <StatCard
          label="Total Supply"
          value={formatTokenAmountTo2Decimals(totalSupply, sectorDecimals)}
          subValue={sectorSymbol}
        />
        <StatCard
          label="Price per Token"
          value={pricePerToken > 0n ? `$${formatTokenAmountTo2Decimals(pricePerToken, quoteDecimals)}` : "..."}
          subValue={`${quoteSymbol} per ${sectorSymbol}`}
        />
      </div>

      {/* Two Column Layout */}
      <div className={styles.layout}>
        {/* Main Content */}
        <div className={styles.mainContent}>
          <ToneChart sector={sector} />

          <BasketComposition sector={sector} />

          {/* About Section */}
          <div className={styles.aboutSection}>
            <h2 className={styles.sectionTitle}>About This Sector</h2>
            <p className={styles.sectionText}>
              {sector.description} This sector token automatically maintains target allocations
              through smart contract rebalancing, providing diversified exposure to the {sector.name.toLowerCase()} ecosystem.
            </p>
          </div>
        </div>

        {/* Trade Panel (Sticky) */}
        <div className={styles.sidebar}>
          <TradePanel sector={sector} />
        </div>
      </div>
    </div>
  );
}
