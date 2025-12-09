"use client";

import { useAccount } from "wagmi";
import { SectorConfig } from "@/lib/sectors";
import { useSectorVault, useTokenMetadata, formatTokenAmountTo2Decimals } from "@/lib/hooks/useMultiSectorVault";
import styles from "./UserPosition.module.css";
import { AddTokenButton } from "./AddTokenButton";

interface UserPositionProps {
  sector: SectorConfig;
}

export function UserPosition({ sector }: UserPositionProps) {
  const { isConnected } = useAccount();
  const { sectorTokenBalance, totalSupply, totalValue } = useSectorVault(sector);
  const sectorToken = useTokenMetadata(sector.tokenAddress);
  const quoteToken = useTokenMetadata(sector.quoteTokenAddress);

  const sectorDecimals = sectorToken.decimals ?? 18;
  const sectorSymbol = sectorToken.symbol ?? "...";
  const quoteDecimals = quoteToken.decimals ?? 6;
  const quoteSymbol = quoteToken.symbol ?? "USDC";

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Your Position</h3>
        <p className={styles.connectMessage}>Connect your wallet to view your position</p>
      </div>
    );
  }

  // Calculate user's USD value
  const userBalance = sectorTokenBalance || 0n;
  const userValue = totalSupply && totalValue && userBalance > 0n
    ? (userBalance * totalValue) / totalSupply
    : 0n;

  // Calculate % of pool
  const poolPercentage = totalSupply && totalSupply > 0n && userBalance > 0n
    ? (Number(userBalance) / Number(totalSupply)) * 100
    : 0;

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Your Position</h3>

      <div className={styles.stats}>
        <div className={styles.statRow}>
          <span className={styles.label}>Balance</span>
          <span className={styles.value}>
            {formatTokenAmountTo2Decimals(userBalance, sectorDecimals)} {sectorSymbol}
          </span>
        </div>

        <div className={styles.statRow}>
          <span className={styles.label}>Value</span>
          <span className={styles.value}>
            ${formatTokenAmountTo2Decimals(userValue, quoteDecimals)}
          </span>
        </div>

        {poolPercentage > 0 && (
          <div className={styles.statRow}>
            <span className={styles.label}>Pool Share</span>
            <span className={styles.value}>
              {poolPercentage < 0.01 ? "<0.01" : poolPercentage.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {userBalance === 0n && (
        <p className={styles.emptyMessage}>
          You don&apos;t have any {sectorSymbol} yet. Deposit {quoteSymbol} to get started.
        </p>
      )}

      {userBalance > 0n && (
        <AddTokenButton id={sector.id} />
      )}
    </div>
  );
}
