"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import {
  useSectorVault,
  useApproveUsdc,
  useDeposit,
  formatTokenAmount,
  parseTokenAmount,
} from "../lib/hooks/useSectorVault";
import styles from "./Card.module.css";

export function DepositCard() {
  const { isConnected } = useAccount();
  const [amount, setAmount] = useState("");

  const { usdcBalance, usdcAllowance, refetchAll } = useSectorVault();
  const { approve, isPending: isApproving, isConfirming: isApprovingConfirming, isSuccess: isApproved } = useApproveUsdc();
  const { deposit, isPending: isDepositing, isConfirming: isDepositingConfirming, isSuccess: isDeposited } = useDeposit();

  const amountBigInt = amount ? parseTokenAmount(amount, 6) : 0n; // USDC has 6 decimals
  const needsApproval = usdcAllowance !== undefined && amountBigInt > usdcAllowance;

  const handleApprove = () => {
    if (!amountBigInt) return;
    approve(amountBigInt);
  };

  const handleDeposit = () => {
    if (!amountBigInt) return;
    deposit(amountBigInt);
  };

  const handleMax = () => {
    if (usdcBalance) {
      setAmount(formatTokenAmount(usdcBalance, 6));
    }
  };

  // Handle successful deposit
  useEffect(() => {
    if (isDeposited) {
      // Reset form after a delay
      const timer = setTimeout(() => {
        setAmount("");
        refetchAll();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isDeposited, refetchAll]);

  if (!isConnected) {
    return (
      <div className={styles.card}>
        <h2>Deposit USDC</h2>
        <p className={styles.connectMessage}>Please connect your wallet to deposit</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h2>Deposit USDC</h2>
      <p className={styles.description}>
        Deposit USDC to receive sector tokens representing your share of the basket
      </p>

      <div className={styles.balanceInfo}>
        <span>Your USDC Balance:</span>
        <span className={styles.balance}>
          {usdcBalance ? formatTokenAmount(usdcBalance, 6) : "0"} USDC
        </span>
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="depositAmount">Amount (USDC)</label>
        <div className={styles.inputWrapper}>
          <input
            id="depositAmount"
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

      {needsApproval ? (
        <button
          onClick={handleApprove}
          disabled={isApproving || isApprovingConfirming || !amountBigInt}
          className={styles.button}
        >
          {isApproving || isApprovingConfirming
            ? "Approving..."
            : isApproved
            ? "Approved ✓"
            : "Approve USDC"}
        </button>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={isDepositing || isDepositingConfirming || !amountBigInt}
          className={styles.button}
        >
          {isDepositing || isDepositingConfirming
            ? "Depositing..."
            : isDeposited
            ? "Deposited ✓"
            : "Deposit"}
        </button>
      )}

      {isDeposited && (
        <p className={styles.successMessage}>
          Deposit successful! Your sector tokens will be minted once the fulfillment engine processes your deposit.
        </p>
      )}
    </div>
  );
}
