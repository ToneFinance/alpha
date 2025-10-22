"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import {
  useSectorVault,
  useWithdraw,
  formatTokenAmount,
  parseTokenAmount,
  useTokenMetadata,
} from "../lib/hooks/useSectorVault";
import { CONTRACTS } from "../lib/contracts";
import styles from "./Card.module.css";

export function WithdrawCard() {
  const { isConnected } = useAccount();
  const [amount, setAmount] = useState("");

  const { sectorTokenBalance, refetchAll } = useSectorVault();
  const { withdraw, isPending, isConfirming, isSuccess } = useWithdraw();

  // Fetch dynamic token metadata from configured addresses
  const sectorToken = useTokenMetadata(CONTRACTS.SECTOR_TOKEN);
  const sectorDecimals = sectorToken.decimals ?? 18;
  const sectorSymbol = sectorToken.symbol ?? "Sector Token";

  const amountBigInt = amount ? parseTokenAmount(amount, sectorDecimals) : 0n;

  const handleWithdraw = () => {
    if (!amountBigInt) return;
    withdraw(amountBigInt);
  };

  const handleMax = () => {
    if (sectorTokenBalance) {
      setAmount(formatTokenAmount(sectorTokenBalance, sectorDecimals));
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
        Burn {sectorSymbol} to receive your proportional share of underlying tokens
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
