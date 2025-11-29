"use client";

import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { MainContent } from "./MainContent";
import styles from "./AppLayout.module.css";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className={styles.appLayout}>
      <Sidebar />
      <div className={styles.mainArea}>
        <Navbar />
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}
