import { ReactNode } from "react";
import styles from "./AppLayout.module.css";

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  return (
    <main className={styles.mainContent}>
      <div className={styles.contentWrapper}>
        {children}
      </div>
    </main>
  );
}
