"use client";

import { useAccount } from "wagmi";
import { SectorConfig } from "@/lib/sectors";
import {
  useUserPendingDeposits,
  useUserPendingWithdrawals,
  useTokenMetadata,
  formatTokenAmountTo2Decimals,
} from "@/lib/hooks/useMultiSectorVault";
import styles from "./PendingTransactions.module.css";

interface PendingTransactionsProps {
  sector: SectorConfig;
}

export function PendingTransactions({ sector }: PendingTransactionsProps) {
  const { isConnected } = useAccount();

  const quoteToken = useTokenMetadata(sector.quoteTokenAddress);
  const sectorToken = useTokenMetadata(sector.tokenAddress);

  const quoteDecimals = quoteToken.decimals ?? 6;
  const quoteSymbol = quoteToken.symbol ?? "USDC";
  const sectorDecimals = sectorToken.decimals ?? 18;
  const sectorSymbol = sectorToken.symbol ?? "...";

  // Fetch user's pending deposits and withdrawals from the chain
  const { pendingDeposits } = useUserPendingDeposits(sector);
  const { pendingWithdrawals } = useUserPendingWithdrawals(sector);

  if (!isConnected) return null;

  if (pendingDeposits.length === 0 && pendingWithdrawals.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Pending Transactions</h3>
      <p className={styles.description}>
        These transactions are waiting to be fulfilled by the engine.
      </p>

      {pendingDeposits.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Deposits</h4>
          {pendingDeposits.map((deposit) => (
            <div key={deposit.id.toString()} className={styles.transaction}>
              <div className={styles.transactionInfo}>
                <span className={styles.transactionType}>Deposit</span>
                <span className={styles.transactionAmount}>
                  {formatTokenAmountTo2Decimals(deposit.quoteAmount, quoteDecimals)} {quoteSymbol}
                </span>
              </div>
              <div className={styles.transactionMeta}>
                <span className={styles.transactionId}>ID: {deposit.id.toString()}</span>
                <span className={styles.transactionTime}>
                  {new Date(Number(deposit.timestamp) * 1000).toLocaleString()}
                </span>
              </div>
              <div className={styles.pending}>
                <div className={styles.spinner} />
                <span>Awaiting fulfillment...</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingWithdrawals.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Withdrawals</h4>
          {pendingWithdrawals.map((withdrawal) => (
            <div key={withdrawal.id.toString()} className={styles.transaction}>
              <div className={styles.transactionInfo}>
                <span className={styles.transactionType}>Withdrawal</span>
                <span className={styles.transactionAmount}>
                  {formatTokenAmountTo2Decimals(withdrawal.sharesAmount, sectorDecimals)} {sectorSymbol}
                </span>
              </div>
              <div className={styles.transactionMeta}>
                <span className={styles.transactionId}>ID: {withdrawal.id.toString()}</span>
                <span className={styles.transactionTime}>
                  {new Date(Number(withdrawal.timestamp) * 1000).toLocaleString()}
                </span>
              </div>
              <div className={styles.pending}>
                <div className={styles.spinner} />
                <span>Awaiting fulfillment...</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
