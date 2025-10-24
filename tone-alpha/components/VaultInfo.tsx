"use client";

import { useSectorVault, formatTokenAmount, formatTokenAmountTo2Decimals, useTokenMetadata, useTargetWeight } from "../lib/hooks/useSectorVault";
import { CONTRACTS } from "../lib/contracts";
import { AddTokenButton } from "./AddTokenButton";
import styles from "./Card.module.css";

function TokenRow({ address, balance }: { address: string; balance: bigint }) {
  const token = useTokenMetadata(address);
  const weight = useTargetWeight(address);
  const symbol = token.symbol ?? "...";
  const decimals = token.decimals ?? 18;

  // Convert weight from basis points (10000 = 100%) to percentage
  const weightPercent = weight ? (Number(weight) / 100).toFixed(1) : null;

  return (
    <div className={styles.tokenItem}>
      <span className={styles.tokenSymbol}>
        {symbol}
        {weightPercent && (
          <span className={styles.tokenWeight}>
            ({weightPercent}%)
          </span>
        )}
      </span>
      <span className={styles.tokenBalance}>
        {formatTokenAmount(balance, decimals)}
      </span>
    </div>
  );
}

export function VaultInfo() {
  const { totalSupply, totalValue, vaultBalances, underlyingTokens } = useSectorVault();

  // Fetch dynamic token metadata from configured addresses
  const sectorToken = useTokenMetadata(CONTRACTS.SECTOR_TOKEN);
  const quoteToken = useTokenMetadata(CONTRACTS.USDC);

  const sectorDecimals = sectorToken.decimals ?? 18;
  const sectorSymbol = sectorToken.symbol ?? "Sector Token";
  const quoteSymbol = quoteToken.symbol ?? "USDC";
  const quoteDecimals = quoteToken.decimals ?? 6;

  return (
    <div className={styles.infoCard}>
      <h2>{sectorToken.name || "Sector Vault"}</h2>

      <div className={styles.statGrid}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Supply</span>
          <span className={styles.statValue} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatTokenAmountTo2Decimals(totalSupply, sectorDecimals)} {sectorSymbol}
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Value Locked (TVL)</span>
          <span className={styles.statValue} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatTokenAmountTo2Decimals(totalValue, quoteDecimals)} {quoteSymbol}
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
        Deposit {quoteSymbol} to receive {sectorSymbol}, which can be withdrawn for underlying assets.
      </p>

      <AddTokenButton />
    </div>
  );
}
