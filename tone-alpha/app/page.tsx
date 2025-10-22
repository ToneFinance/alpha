"use client";
import styles from "./page.module.css";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { DepositCard } from "../components/DepositCard";
import { WithdrawCard } from "../components/WithdrawCard";
import { VaultInfo } from "../components/VaultInfo";
import { PendingDepositsCard } from "../components/PendingDepositsCard";
import Image from "next/image";
import { sdk } from "@farcaster/miniapp-sdk";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    sdk.actions.ready();
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Image
            src="/logo.png"
            alt="Tone Finance Logo"
            width={60}
            height={60}
            style={{ borderRadius: "50%" }}
          />
          <div>
            <div className={styles.logoText}>Tone Finance</div>
            <div className={styles.logoSubtext}>On-Chain Sector Tokens</div>
          </div>
        </div>
        <Wallet />
      </header>

      <main className={styles.main}>
        <div className={styles.badge}>
          ⚠️ Alpha Version - Base Sepolia Testnet
        </div>

        <p className={styles.subtitle}>
          Invest in diversified crypto sectors with on-chain ETF-like tokens.
          Deposit USDC, receive sector tokens representing a basket of DeFi assets.
        </p>

        <div className={styles.vaultInfoWrapper}>
          <VaultInfo />
        </div>

        <div className={styles.grid}>
          <DepositCard />
          <WithdrawCard />
        </div>

        <div className={styles.vaultInfoWrapper} style={{ marginTop: "40px" }}>
          <PendingDepositsCard />
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <a
            href="https://tone.finance"
            target="_blank"
            rel="noreferrer"
            className={styles.footerLink}
          >
            Website
          </a>
          <a
            href="https://docs.base.org"
            target="_blank"
            rel="noreferrer"
            className={styles.footerLink}
          >
            Docs
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className={styles.footerLink}
          >
            GitHub
          </a>
        </div>
        <p>Built on Base with OnchainKit</p>
      </footer>
    </div>
  );
}
