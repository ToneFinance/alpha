"use client";

import { useState, useEffect, useRef } from "react";
import {
  useSectorVault,
  useApproveUsdc,
  useDeposit,
  formatTokenAmount,
  parseTokenAmount,
  useTokenMetadata,
} from "../lib/hooks/useSectorVault";
import { CONTRACTS } from "../lib/contracts";
import styles from "./Card.module.css";

interface DepositFormContentProps {
  onDepositSuccess: () => void;
}

export function DepositFormContent({ onDepositSuccess }: DepositFormContentProps) {
  const [amount, setAmount] = useState("");
  const [displayError, setDisplayError] = useState<string | null>(null);
  const depositAmountRef = useRef<bigint>(0n);
  const hasTriggeredDepositRef = useRef(false);

  const { usdcBalance, usdcAllowance, refetchAll } = useSectorVault();
  const { approve, isPending: isApproving, isConfirming: isApprovingConfirming, isSuccess: isApproved, hash: approveHash, isError: approveError, error: approveErrorMsg } = useApproveUsdc();
  const { deposit, isPending: isDepositing, isConfirming: isDepositingConfirming, isSuccess: isDeposited, isError: depositError, error: depositErrorMsg } = useDeposit();

  // Fetch dynamic token metadata from configured addresses
  const quoteToken = useTokenMetadata(CONTRACTS.USDC);
  const sectorToken = useTokenMetadata(CONTRACTS.SECTOR_TOKEN);

  const quoteDecimals = quoteToken.decimals ?? 6;
  const quoteSymbol = quoteToken.symbol ?? "USDC";
  const sectorSymbol = sectorToken.symbol ?? "Sector Token";

  const amountBigInt = amount ? parseTokenAmount(amount, quoteDecimals) : 0n;
  const needsApproval = usdcAllowance !== undefined && amountBigInt > usdcAllowance;

  // Store the deposit amount when approval is initiated
  useEffect(() => {
    if (isApproving && amountBigInt > 0n) {
      depositAmountRef.current = amountBigInt;
      hasTriggeredDepositRef.current = false;
    }
  }, [isApproving, amountBigInt]);

  // Automatically trigger deposit after approval is confirmed
  useEffect(() => {
    if (isApproved && depositAmountRef.current > 0n && !hasTriggeredDepositRef.current) {
      hasTriggeredDepositRef.current = true;
      // Refetch allowance to ensure it's updated
      refetchAll();
      // Trigger deposit after a short delay to ensure state is updated
      const timer = setTimeout(() => {
        deposit(depositAmountRef.current);
        depositAmountRef.current = 0n;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isApproved, approveHash, deposit, refetchAll]);

  // Handle approval errors
  useEffect(() => {
    if (approveError) {
      setDisplayError(`Approval failed: ${approveErrorMsg?.message || "Unknown error"}`);
    }
  }, [approveError, approveErrorMsg]);

  // Handle deposit errors
  useEffect(() => {
    if (depositError) {
      setDisplayError(`Deposit failed: ${depositErrorMsg?.message || "Unknown error"}`);
    }
  }, [depositError, depositErrorMsg]);

  const handleApprove = () => {
    if (!amountBigInt) return;
    setDisplayError(null);
    approve(amountBigInt);
  };

  const handleDeposit = () => {
    if (!amountBigInt) return;
    setDisplayError(null);
    deposit(amountBigInt);
  };

  const handleMax = () => {
    if (usdcBalance) {
      setAmount(formatTokenAmount(usdcBalance, quoteDecimals));
    }
  };

  // Handle successful deposit
  useEffect(() => {
    if (isDeposited) {
      refetchAll();
      onDepositSuccess();
    }
  }, [isDeposited, refetchAll, onDepositSuccess]);

  return (
    <div className={styles.card}>
      <h2>Deposit {quoteSymbol}</h2>
      <p className={styles.description}>
        Deposit {quoteSymbol} to receive {sectorSymbol} representing your share of the basket
      </p>

      <div className={styles.balanceInfo}>
        <span>Your {quoteSymbol} Balance:</span>
        <span className={styles.balance}>
          {usdcBalance ? formatTokenAmount(usdcBalance, quoteDecimals) : "0"} {quoteSymbol}
        </span>
      </div>

      <a
        href="https://faucet.circle.com/"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.faucetLink}
      >
        Get testnet {quoteSymbol} →
      </a>

      <div className={styles.inputGroup}>
        <label htmlFor="depositAmount">Amount ({quoteSymbol})</label>
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

      {needsApproval && (
        <p className={styles.infoMessage}>
          First-time deposit requires 2 transactions: approve {quoteSymbol} spending, then deposit
        </p>
      )}

      {displayError && (
        <p className={styles.errorMessage}>
          ⚠️ {displayError}
        </p>
      )}

      {needsApproval ? (
        <button
          onClick={handleApprove}
          disabled={isApproving || isApprovingConfirming || isDepositing || isDepositingConfirming || !amountBigInt}
          className={styles.button}
        >
          {isApproving || isApprovingConfirming
            ? "Approving... (1/2)"
            : isApproved && (isDepositing || isDepositingConfirming)
            ? "Depositing... (2/2)"
            : isApproved
            ? "Approved ✓"
            : "Approve & Deposit"}
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
          Deposit successful! Your {sectorSymbol} will be minted once the fulfillment engine processes your deposit.
        </p>
      )}
    </div>
  );
}
