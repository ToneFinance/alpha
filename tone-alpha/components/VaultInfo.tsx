"use client";

import { useSectorVault, formatTokenAmount, useTokenSymbol } from "../lib/hooks/useSectorVault";
import { AddTokenButton } from "./AddTokenButton";
import styles from "./Card.module.css";

function TokenRow({ address, balance }: { address: string; balance: bigint }) {
  const symbol = useTokenSymbol(address);

  return (
    <div className={styles.tokenItem}>
      <span className={styles.tokenSymbol}>
        {symbol || "..."}
      </span>
      <span>
        {formatTokenAmount(balance, 18)}
      </span>
    </div>
  );
}

export function VaultInfo() {
  const { totalSupply, vaultBalances, underlyingTokens } = useSectorVault();

  return (
    <div className={styles.infoCard}>
      <h2>DeFi Sector Vault</h2>

      <div className={styles.statGrid}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Supply</span>
          <span className={styles.statValue}>
            {totalSupply ? formatTokenAmount(totalSupply, 18) : "0"} DEFI
          </span>
        </div>
      </div>

      {vaultBalances && underlyingTokens && (
        <div className={styles.tokenList}>
          <h3>Basket Composition</h3>
          {vaultBalances[0]?.map((tokenAddress: string, index: number) => (
            <TokenRow
              key={tokenAddress}
              address={tokenAddress}
              balance={vaultBalances[1][index]}
            />
          ))}
        </div>
      )}

      <p className={styles.description} style={{ marginTop: "20px", marginBottom: 0 }}>
        Tone Finance sector tokens are on-chain ETFs representing a basket of DeFi tokens.
        Deposit USDC to receive sector tokens, which can be withdrawn for underlying assets.
      </p>

      <AddTokenButton />
    </div>
  );
}
