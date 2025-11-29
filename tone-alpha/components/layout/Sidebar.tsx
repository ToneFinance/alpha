"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard, Layers, BookOpen, X, Menu } from "lucide-react";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        className={styles.mobileMenuButton}
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label="Toggle menu"
      >
        {isCollapsed ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${isCollapsed ? styles.open : ""}`}>
        {/* Logo Section */}
        <div className={styles.logoSection}>
          <Image
            src="/logo.png"
            alt="Tone Finance Logo"
            width={48}
            height={48}
            style={{ borderRadius: "50%" }}
          />
          <div className={styles.logoText}>
            <div className={styles.logoTitle}>Tone Finance</div>
            <div className={styles.logoSubtitle}>On-Chain Sector Tokens</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          <Link href="/dashboard" className={styles.navItem}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
          <Link href="/sectors" className={styles.navItem}>
            <Layers size={20} />
            <span>Sectors</span>
          </Link>
          <a
            href="https://docs.tone.finance"
            target="_blank"
            rel="noreferrer"
            className={styles.navItem}
          >
            <BookOpen size={20} />
            <span>Documentation</span>
          </a>
        </nav>

        {/* Footer Links */}
        <div className={styles.sidebarFooter}>
          <div className={styles.footerLinks}>
            <a
              href="https://tone.finance"
              target="_blank"
              rel="noreferrer"
              className={styles.footerLink}
            >
              Website
            </a>
            <a
              href="https://github.com/ToneFinance"
              target="_blank"
              rel="noreferrer"
              className={styles.footerLink}
            >
              GitHub
            </a>
          </div>
          <p className={styles.footerText}>Built on Base with OnchainKit</p>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isCollapsed && (
        <div
          className={styles.overlay}
          onClick={() => setIsCollapsed(false)}
        />
      )}
    </>
  );
}
