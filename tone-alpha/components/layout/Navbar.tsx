"use client";

import { Wallet } from "@coinbase/onchainkit/wallet";
import { ArrowUpRight } from "lucide-react";
import styles from "./Navbar.module.css";

export function Navbar() {
  return (
    <nav className={styles.navbar}>
      <div className={styles.navbarContent}>
        {/* Page Title / Breadcrumb */}
        <div className={styles.pageTitle}>
          <h1>Dashboard</h1>
        </div>

        {/* Actions */}
        <div className={styles.navbarActions}>
          <div className={styles.badge}>
            ⚠️ Alpha Version - Base Sepolia Testnet
          </div>
          <a
            href="https://tone.finance"
            target="_blank"
            rel="noreferrer"
            className={styles.homepageLink}
          >
            <span>tone.finance</span>
            <ArrowUpRight size={16} />
          </a>
          <Wallet />
        </div>
      </div>
    </nav>
  );
}
