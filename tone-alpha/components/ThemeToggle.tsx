"use client";

import { useTheme } from "@/lib/theme";
import { Sun, Moon, Monitor } from "lucide-react";
import styles from "./ThemeToggle.module.css";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes: Array<{ value: "light" | "dark" | "auto"; icon: typeof Sun; label: string }> = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "auto", icon: Monitor, label: "Auto" },
  ];

  return (
    <div className={styles.themeToggle}>
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          className={`${styles.themeButton} ${theme === value ? styles.active : ""}`}
          onClick={() => setTheme(value)}
          title={`${label} mode`}
          aria-label={`Switch to ${label} mode`}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
