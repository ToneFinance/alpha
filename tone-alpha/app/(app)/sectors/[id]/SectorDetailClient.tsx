"use client";

import { useEffect } from "react";
import { SectorConfig } from "@/lib/sectors";
import { SectorVaultInfo } from "@/components/SectorVaultInfo";
import { SectorDepositCard } from "@/components/SectorDepositCard";
import { SectorWithdrawCard } from "@/components/SectorWithdrawCard";
import { sdk } from "@farcaster/miniapp-sdk";
import styles from "./page.module.css";

interface SectorDetailClientProps {
  sector: SectorConfig;
}

export function SectorDetailClient({ sector }: SectorDetailClientProps) {
  useEffect(() => {
    sdk.actions.ready();
  }, []);

  // If sector is not active yet, show coming soon message
  if (!sector.isActive) {
    return (
      <div className={styles.container}>
        <div className={styles.comingSoon}>
          <span className={styles.comingSoonIcon}>{sector.icon || "📊"}</span>
          <h1>{sector.name}</h1>
          <p>{sector.description}</p>
          <div className={styles.comingSoonBadge}>Coming Soon</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.sectorHeader}>
        <span className={styles.sectorIcon} style={{ color: sector.color }}>
          {sector.icon || "📊"}
        </span>
        <div>
          <h1 className={styles.title}>{sector.name}</h1>
          <p className={styles.subtitle}>{sector.description}</p>
        </div>
      </div>

      <div className={styles.vaultInfoWrapper}>
        <SectorVaultInfo sector={sector} />
      </div>

      <div className={styles.grid}>
        <SectorDepositCard sector={sector} />
        <SectorWithdrawCard sector={sector} />
      </div>
    </div>
  );
}
