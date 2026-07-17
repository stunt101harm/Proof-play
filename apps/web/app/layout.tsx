import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofPlay | Verifiable match predictions",
  description:
    "Create prediction pools anyone can understand and settle them with cryptographically verifiable TxLINE data on Solana.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
