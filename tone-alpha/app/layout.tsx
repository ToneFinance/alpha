import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { RootProvider } from "./rootProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: "Tone Finance - On-Chain Sector Tokens",
  description:
    "Invest in diversified crypto sectors with on-chain ETF-like tokens on Base",
  openGraph: {
    title: "Tone Finance - On-Chain Sector Tokens",
    description: "Invest in diversified crypto sectors with on-chain ETF-like tokens on Base",
    images: ['/og-image.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Tone Finance - On-Chain Sector Tokens",
    description: "Invest in diversified crypto sectors with on-chain ETF-like tokens on Base",
    images: ['/og-image.png'],
  },
  other: {
    "fc:frame": "vNext",
    "fc:frame:image": "/og-image.png",
    "fc:miniapp": JSON.stringify({
      version: "1",
      name: "Tone Finance",
      url: "https://alpha.lab.tone.finance",
      iconUrl: "https://alpha.lab.tone.finance/icon.png",
      splashImageUrl: "https://alpha.lab.tone.finance/splash.png",
      splashBackgroundColor: "#000000",
      description: "Invest in diversified crypto sectors with on-chain ETF-like tokens. Deposit USDC, receive sector tokens representing a basket of DeFi assets.",
      button: {
        title: "Launch App",
        action: {
          type: "launch_miniapp",
          name: "Tone Finance",
          url: "https://alpha.lab.tone.finance",
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${sourceCodePro.variable}`}>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
