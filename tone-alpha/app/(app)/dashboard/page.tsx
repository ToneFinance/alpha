"use client";

import Link from "next/link";
import { getActiveSectors } from "@/lib/sectors";
import { SectorCard } from "@/components/SectorCard";
import { ArrowRight } from "lucide-react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useEffect } from "react";
import styles from "./page.module.css";

export default function DashboardPage() {
  const activeSectors = getActiveSectors();

  useEffect(() => {
    sdk.actions.ready();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Welcome to Tone Finance
        </h1>
        <p className={styles.subtitle}>
          Invest in diversified crypto sectors with on-chain ETF-like tokens.
          Each sector represents a curated basket of tokens in a specific category.
        </p>
      </div>

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Active Sectors</h2>
        <Link href="/sectors" className={styles.viewAllLink}>
          View All Sectors <ArrowRight size={16} />
        </Link>
      </div>

      <div className={styles.sectorsGrid}>
        {activeSectors.map((sector) => (
          <SectorCard key={sector.id} sector={sector} />
        ))}
      </div>

      {activeSectors.length === 0 && (
        <div className={styles.emptyState}>
          <p>No active sectors at the moment. Check back soon!</p>
        </div>
      )}

      <div className={styles.infoSection}>
        <h3>How It Works</h3>
        <div className={styles.stepsGrid}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <h4>Choose a Sector</h4>
            <p>Browse and select a sector that matches your investment strategy</p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <h4>Deposit USDC</h4>
            <p>Deposit USDC to receive sector tokens representing a basket of assets</p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <h4>Manage & Withdraw</h4>
            <p>Track your holdings and withdraw anytime to receive underlying tokens</p>
          </div>
        </div>
      </div>
    </div>
  );
}
