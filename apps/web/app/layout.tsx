import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bitstock: buy tokenized stocks only after the checks pass", template: "%s · Bitstock" },
  description: "Bitstock checks the market, the token, an independent price and a dry run before every small buy of a tokenized stock on BNB Smart Chain, and shows every check.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e11" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Rendered per request so each response carries a fresh CSP nonce (see proxy.ts).
  await connection();
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Shell>{children}</Shell>
        </WalletProvider>
      </body>
    </html>
  );
}
