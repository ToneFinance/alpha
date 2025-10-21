"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import {
  useSectorVault,
  useWithdraw,
  formatTokenAmount,
  parseTokenAmount,
} from "../lib/hooks/useSectorVault";
import styles from "./Card.module.css";

export function WithdrawCard() {
  const { isConnected } = useAccount();
  const [amount, setAmount] = useState("");

  const { sectorTokenBalance, refetchAll } = useSectorVault();
  const { withdraw, isPending, isConfirming, isSuccess } = useWithdraw();

  const amountBigInt = amount ? parseTokenAmount(amount, 18) : 0n;

  const handleWithdraw = () => {
    if (!amountBigInt) return;
    withdraw(amountBigInt);
  };

  const handleMax = () => {
    if (sectorTokenBalance) {
      setAmount(formatTokenAmount(sectorTokenBalance, 18));
    }
  };

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
      <p className={styles.description}>
        Burn sector tokens to receive your proportional share of underlying tokens
      </p>

      <div className={styles.balanceInfo}>
        <span>Your Sector Tokens:</span>
        <span className={styles.balance}>
          {sectorTokenBalance ? formatTokenAmount(sectorTokenBalance, 18) : "0"} DEFI
        </span>
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="withdrawAmount">Amount (Sector Tokens)</label>
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

      <button
        onClick={handleWithdraw}
        disabled={isPending || isConfirming || !amountBigInt}
        className={styles.button}
      >
        {isPending || isConfirming
          ? "Withdrawing..."
          : isSuccess
          ? "Withdrawn ✓"
          : "Withdraw"}
      </button>

      {isSuccess && (
        <p className={styles.successMessage}>
          Withdrawal successful! You have received your share of the underlying tokens.
        </p>
      )}
    </div>
  );
}
