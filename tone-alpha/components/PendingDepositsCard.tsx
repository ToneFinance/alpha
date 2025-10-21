"use client";

import { useAccount } from "wagmi";
import { useNextDepositId, usePendingDeposit, formatTokenAmount } from "../lib/hooks/useSectorVault";
import styles from "./Card.module.css";

export function PendingDepositsCard() {
  const { address, isConnected } = useAccount();
  const { nextDepositId } = useNextDepositId();

  if (!isConnected) {
    return (
      <div className={styles.card}>
        <h2>Pending Deposits</h2>
        <p className={styles.connectMessage}>Connect your wallet to view pending deposits</p>
      </div>
    );
  }

  // Generate array of deposit IDs to check
  const depositIds = nextDepositId
    ? Array.from({ length: Number(nextDepositId) }, (_, i) => BigInt(i))
    : [];

  return (
    <div className={styles.card}>
      <h2>Pending Deposits</h2>
      <p className={styles.description}>
        Deposits waiting to be fulfilled by the engine
      </p>

      {depositIds.length === 0 ? (
        <p className={styles.connectMessage}>No deposits found</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {depositIds.map((depositId) => (
            <PendingDepositItem
              key={depositId.toString()}
              depositId={depositId}
              userAddress={address}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PendingDepositItem({ depositId, userAddress }: { depositId: bigint; userAddress: string | undefined }) {
  const { pendingDeposit } = usePendingDeposit(depositId);

  if (!pendingDeposit || !userAddress) {
    return null;
  }

  const [user, quoteAmount, fulfilled, timestamp] = pendingDeposit;

  // Only show if it belongs to the user and is not fulfilled
  if (user.toLowerCase() !== userAddress.toLowerCase() || fulfilled) {
    return null;
  }

  const date = new Date(Number(timestamp) * 1000);
  const timeAgo = getTimeAgo(date);

  return (
    <div className={styles.balanceInfo} style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        <span style={{ fontSize: "12px", opacity: 0.7 }}>Deposit #{depositId.toString()}</span>
        <span className={styles.balance}>{formatTokenAmount(quoteAmount, 6)} USDC</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "12px", opacity: 0.6 }}>
        <span>{timeAgo}</span>
        <span style={{ color: "#ffa500" }}>⏳ Pending</span>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
