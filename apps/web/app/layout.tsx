import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { WalletProvider } from "@/components/wallet-provider";
import { readPublicEnv } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "ProofPlay | Verifiable match predictions",
  description:
    "Create prediction pools anyone can understand and settle them with cryptographically verifiable TxLINE data on Solana.",
  openGraph: {
    title: "ProofPlay | Verifiable match predictions",
    description: "Prediction pools that settle with proof.",
    images: [{ url: "/og.png", width: 1536, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ProofPlay | Verifiable match predictions",
    description: "Prediction pools that settle with proof.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const publicEnv = readPublicEnv();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <aside className="prototype-strip" aria-label="Prototype notice">
          <strong>18+ hackathon prototype</strong>
          <span>
            Solana devnet only · demo tokens have no monetary value · no prizes
            or real-money wagering
          </span>
          <Link href="/legal">Legal &amp; data notice</Link>
        </aside>
        <WalletProvider config={publicEnv}>
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
