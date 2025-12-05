"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { SectorConfig } from "@/lib/sectors";
import {
  useSectorVault,
  useWithdraw,
  useRequestWithdrawal,
  useCalculateWithdrawalValue,
  formatTokenAmount,
  parseTokenAmount,
  useTokenMetadata,
} from "@/lib/hooks/useMultiSectorVault";
import styles from "./Card.module.css";

interface SectorWithdrawCardProps {
  sector: SectorConfig;
}

export function SectorWithdrawCard({ sector }: SectorWithdrawCardProps) {
  const { isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const [withdrawalType, setWithdrawalType] = useState<"instant" | "usdc">("usdc");

  const { sectorTokenBalance, refetchAll } = useSectorVault(sector);
  const { withdraw: instantWithdraw, isPending: isPendingInstant, isConfirming: isConfirmingInstant, isSuccess: isSuccessInstant } = useWithdraw(sector);
  const { requestWithdrawal, isPending: isPendingRequest, isConfirming: isConfirmingRequest, isSuccess: isSuccessRequest } = useRequestWithdrawal(sector);

  // Fetch dynamic token metadata
  const sectorToken = useTokenMetadata(sector.tokenAddress);
  const quoteToken = useTokenMetadata(sector.quoteTokenAddress);
  const sectorDecimals = sectorToken.decimals ?? 18;
  const sectorSymbol = sectorToken.symbol ?? "Sector Token";
  const quoteDecimals = quoteToken.decimals ?? 6;
  const quoteSymbol = quoteToken.symbol ?? "USDC";

  const amountBigInt = amount ? parseTokenAmount(amount, sectorDecimals) : 0n;

  // Calculate expected USDC value for the withdrawal amount
  const { usdcValue } = useCalculateWithdrawalValue(sector, amountBigInt);

  const handleWithdraw = () => {
    if (!amountBigInt) return;

    if (withdrawalType === "instant") {
      instantWithdraw(amountBigInt);
    } else {
      requestWithdrawal(amountBigInt);
    }
  };

  const handleMax = () => {
    if (sectorTokenBalance) {
      setAmount(formatTokenAmount(sectorTokenBalance, sectorDecimals));
    }
  };

  const isPending = withdrawalType === "instant" ? isPendingInstant : isPendingRequest;
  const isConfirming = withdrawalType === "instant" ? isConfirmingInstant : isConfirmingRequest;
  const isSuccess = withdrawalType === "instant" ? isSuccessInstant : isSuccessRequest;

  // Reset form on success
  if (isSuccess && amount) {
    setTimeout(() => {
      setAmount("");
      refetchAll();
    }, 2000);
  }

  if (!isConnected) {
    return (
      <div className={styles.card}>
        <h2>Withdraw</h2>
        <p className={styles.connectMessage}>Please connect your wallet to withdraw</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h2>Withdraw</h2>

      {/* Withdrawal Type Selector */}
      <div className={styles.typeSelector}>
        <button
          className={`${styles.typeButton} ${withdrawalType === "usdc" ? styles.active : ""}`}
          onClick={() => setWithdrawalType("usdc")}
        >
          <div className={styles.typeButtonContent}>
            <strong>{quoteSymbol}</strong>
            <span className={styles.typeHint}>~12s</span>
          </div>
        </button>
        <button
          className={`${styles.typeButton} ${withdrawalType === "instant" ? styles.active : ""}`}
          onClick={() => setWithdrawalType("instant")}
        >
          <div className={styles.typeButtonContent}>
            <strong>Tokens</strong>
            <span className={styles.typeHint}>Instant</span>
          </div>
        </button>
      </div>

      {/* Description based on withdrawal type */}
      <p className={styles.description}>
        {withdrawalType === "usdc"
          ? `Burn ${sectorSymbol} to receive ${quoteSymbol}. Automated fulfillment takes ~12 seconds.`
          : `Burn ${sectorSymbol} to instantly receive your proportional share of underlying tokens.`
        }
      </p>

      <div className={styles.balanceInfo}>
        <span>Your {sectorSymbol}:</span>
        <span className={styles.balance}>
          {sectorTokenBalance ? formatTokenAmount(sectorTokenBalance, sectorDecimals) : "0"} {sectorSymbol}
        </span>
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="withdrawAmount">Amount ({sectorSymbol})</label>
        <div className={styles.inputWrapper}>
          <input
            id="withdrawAmount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={styles.input}
            step="0.01"
            min="0"
          />
          <button onClick={handleMax} className={styles.maxButton}>
            MAX
          </button>
        </div>
      </div>

      {/* Show expected USDC value for USDC withdrawals */}
      {withdrawalType === "usdc" && amountBigInt > 0n && usdcValue && (
        <div className={styles.estimateInfo}>
          <span>You will receive:</span>
          <span className={styles.estimateValue}>
            ~{formatTokenAmount(usdcValue, quoteDecimals)} {quoteSymbol}
          </span>
        </div>
      )}

      <button
        onClick={handleWithdraw}
        disabled={isPending || isConfirming || !amountBigInt}
        className={styles.button}
      >
        {isPending || isConfirming
          ? withdrawalType === "usdc" ? "Requesting..." : "Withdrawing..."
          : isSuccess
          ? withdrawalType === "usdc" ? "Requested ✓" : "Withdrawn ✓"
          : withdrawalType === "usdc" ? `Request ${quoteSymbol} Withdrawal` : "Withdraw Tokens"}
      </button>

      {isSuccessRequest && (
        <p className={styles.successMessage}>
          Withdrawal requested! Your {quoteSymbol} will arrive in ~12 seconds.
        </p>
      )}

      {isSuccessInstant && (
        <p className={styles.successMessage}>
          Withdrawal successful! You have received your share of the underlying tokens.
        </p>
      )}
    </div>
  );
}
