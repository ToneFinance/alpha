"use client";

import { SectorConfig } from "@/lib/sectors";
import { useSectorVault, useTokenMetadata, useTargetWeight, formatTokenAmount } from "@/lib/hooks/useMultiSectorVault";
import styles from "./BasketComposition.module.css";

interface BasketCompositionProps {
  sector: SectorConfig;
}

function TokenRow({ sector, address, balance }: { sector: SectorConfig; address: string; balance: bigint }) {
  const token = useTokenMetadata(address);
  const weight = useTargetWeight(sector, address);
  const symbol = token.symbol ?? "...";
  const name = token.name ?? "Loading...";
  const decimals = token.decimals ?? 18;

  const weightPercent = weight ? Number(weight) / 100 : 0;

  return (
    <tr className={styles.row}>
      <td className={styles.tokenCell}>
        <div className={styles.tokenInfo}>
          <span className={styles.tokenName}>{name}</span>
          <span className={styles.tokenSymbol}>{symbol}</span>
        </div>
      </td>
      <td className={styles.balanceCell}>
        {formatTokenAmount(balance, decimals)}
      </td>
      <td className={styles.weightCell}>
        <div className={styles.weightContainer}>
          <div className={styles.weightBar}>
            <div
              className={styles.weightFill}
              style={{ width: `${weightPercent}%`, background: sector.color }}
            />
          </div>
          <span className={styles.weightText}>{weightPercent.toFixed(1)}%</span>
        </div>
      </td>
    </tr>
  );
}

export function BasketComposition({ sector }: BasketCompositionProps) {
  const { vaultBalances } = useSectorVault(sector);

  if (!vaultBalances || !vaultBalances[0] || vaultBalances[0].length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Basket Composition</h2>
        <p className={styles.emptyState}>No tokens in basket yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Basket Composition</h2>
      <p className={styles.description}>
        This sector token represents a diversified basket of the following assets, automatically rebalanced to maintain target weights.
      </p>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Token</th>
              <th>Balance</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {vaultBalances[0].map((tokenAddress: string, index: number) => (
              <TokenRow
                key={tokenAddress}
                sector={sector}
                address={tokenAddress}
                balance={vaultBalances[1][index]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
