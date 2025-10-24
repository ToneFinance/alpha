"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import confetti from "canvas-confetti";
import { useTokenMetadata } from "../lib/hooks/useSectorVault";
import { CONTRACTS } from "../lib/contracts";
import styles from "./Card.module.css";
import { DepositFormContent } from "./DepositFormContent";

export function DepositCard() {
  const { isConnected } = useAccount();
  const [formKey, setFormKey] = useState(0);

  // Fetch token metadata from configured addresses
  const quoteToken = useTokenMetadata(CONTRACTS.USDC);
  const quoteSymbol = quoteToken.symbol ?? "USDC";

  const handleDepositSuccess = () => {
    // Trigger confetti celebration
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#667eea", "#764ba2", "#ffa500"],
      startVelocity: 30,
      gravity: 0.7,
      decay: 0.94,
    });

    // Reset form after a delay by changing the key
    setTimeout(() => {
      setFormKey((prev) => prev + 1);
    }, 2000);
  };

  if (!isConnected) {
    return (
      <div className={styles.card}>
        <h2>Deposit {quoteSymbol}</h2>
        <p className={styles.connectMessage}>Please connect your wallet to deposit</p>
      </div>
    );
  }

  return (
    <DepositFormContent
      key={formKey}
      onDepositSuccess={handleDepositSuccess}
    />
  );
}
