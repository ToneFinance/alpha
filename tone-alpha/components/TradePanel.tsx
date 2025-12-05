"use client";

import { useState } from "react";
import { SectorConfig } from "@/lib/sectors";
import { SectorDepositCard } from "./SectorDepositCard";
import { SectorWithdrawCard } from "./SectorWithdrawCard";
import { UserPosition } from "./UserPosition";
import styles from "./TradePanel.module.css";

interface TradePanelProps {
  sector: SectorConfig;
}

export function TradePanel({ sector }: TradePanelProps) {
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");

  return (
    <div className={styles.container}>
      {/* User Position */}
      <UserPosition sector={sector} />

      {/* Trade Tabs */}
      <div className={styles.tradeSection}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "deposit" ? styles.active : ""}`}
            onClick={() => setActiveTab("deposit")}
          >
            Deposit
          </button>
          <button
            className={`${styles.tab} ${activeTab === "withdraw" ? styles.active : ""}`}
            onClick={() => setActiveTab("withdraw")}
          >
            Withdraw
          </button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === "deposit" ? (
            <SectorDepositCard sector={sector} />
          ) : (
            <SectorWithdrawCard sector={sector} />
          )}
        </div>
      </div>
    </div>
  );
}
