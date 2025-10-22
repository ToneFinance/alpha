"use client";

import { useAccount } from "wagmi";
import { useNextDepositId, usePendingDeposit, formatTokenAmount, useTokenMetadata } from "../lib/hooks/useSectorVault";
import { CONTRACTS } from "../lib/contracts";
import styles from "./Card.module.css";

export function PendingDepositsCard() {
  const { address, isConnected } = useAccount();
  const { nextDepositId, refetch: refetchNextDepositId } = useNextDepositId();

  // Fetch dynamic token metadata from configured addresses
  const quoteToken = useTokenMetadata(CONTRACTS.USDC);
  const quoteDecimals = quoteToken.decimals ?? 6;
  const quoteSymbol = quoteToken.symbol ?? "USDC";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <h2 style={{ margin: 0 }}>Pending Deposits</h2>
        <button
          onClick={() => refetchNextDepositId()}
          className={styles.maxButton}
          style={{ padding: "6px 12px", fontSize: "12px" }}
        >
          ↻ Refresh
        </button>
      </div>
      <p className={styles.description}>
        Deposits waiting to be fulfilled by the engine (auto-refreshes every 3s)
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
              quoteSymbol={quoteSymbol}
              quoteDecimals={quoteDecimals}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PendingDepositItem({
  depositId,
  userAddress,
  quoteSymbol,
  quoteDecimals,
}: {
  depositId: bigint;
  userAddress: string | undefined;
  quoteSymbol: string;
  quoteDecimals: number;
}) {
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
        <span className={styles.balance}>{formatTokenAmount(quoteAmount, quoteDecimals)} {quoteSymbol}</span>
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
