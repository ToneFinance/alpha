import styles from "./StatCard.module.css";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatCard({ label, value, subValue, trend }: StatCardProps) {
  return (
    <div className={styles.statCard}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {subValue && (
        <div className={`${styles.subValue} ${trend ? styles[trend] : ""}`}>
          {subValue}
        </div>
      )}
    </div>
  );
}
