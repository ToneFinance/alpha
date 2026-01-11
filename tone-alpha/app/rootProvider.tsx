"use client";
import { ReactNode } from "react";
import { baseSepolia } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";
import { NetworkGuard } from "../components/NetworkGuard";
import { ThemeProvider } from "../lib/theme";

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <OnchainKitProvider
        apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
        chain={baseSepolia}
        config={{
          appearance: {
            mode: "auto",
          },
          wallet: {
            display: "modal",
            preference: "all",
          },
        }}
      >
        <NetworkGuard />
        {children}
      </OnchainKitProvider>
    </ThemeProvider>
  );
}
