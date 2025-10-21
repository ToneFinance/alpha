"use client";

import { useWalletClient, useReadContract } from "wagmi";
import { CONTRACTS, sectorTokenConfig } from "../lib/contracts";
import styles from "./AddTokenButton.module.css";

export function AddTokenButton() {
  const { data: walletClient } = useWalletClient();

  // Fetch token symbol from chain
  const { data: symbol } = useReadContract({
    ...sectorTokenConfig,
    functionName: "symbol",
  });

  // Fetch token decimals from chain
  const { data: decimals } = useReadContract({
    ...sectorTokenConfig,
    functionName: "decimals",
  });

  const handleAddToken = async () => {
    if (!walletClient || !symbol || decimals === undefined) return;

    try {
      await walletClient.watchAsset({
        type: "ERC20",
        options: {
          address: CONTRACTS.SECTOR_TOKEN,
          symbol: symbol as string,
          decimals: decimals as number,
          // You can add an image URL here if you have a token logo
          // image: "https://alpha.lab.tone.finance/sector-token-icon.png",
        },
      });
    } catch (error) {
      console.error("Failed to add token:", error);
    }
  };

  return (
    <button
      onClick={handleAddToken}
      className={styles.addTokenButton}
      disabled={!walletClient || !symbol || decimals === undefined}
    >
      + Add {symbol || "Token"} to Wallet
    </button>
  );
}
