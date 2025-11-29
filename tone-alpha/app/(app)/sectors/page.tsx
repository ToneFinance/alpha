"use client";

import { getAllSectors } from "@/lib/sectors";
import { SectorCard } from "@/components/SectorCard";
import styles from "./page.module.css";

export default function SectorsPage() {
  const sectors = getAllSectors();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Sector Tokens</h1>
        <p className={styles.description}>
          Invest in diversified crypto sectors with on-chain ETF-like tokens.
          Each sector represents a curated basket of tokens in a specific category.
        </p>
      </div>

      <div className={styles.sectorsGrid}>
        {sectors.map((sector) => (
          <SectorCard key={sector.id} sector={sector} />
        ))}
      </div>

      {sectors.length === 0 && (
        <div className={styles.emptyState}>
          <p>No sectors available at the moment.</p>
        </div>
      )}
    </div>
  );
}
