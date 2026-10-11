import { NextResponse, type NextRequest } from "next/server";
import { regionVerdict } from "./lib/regions";

// Reown AppKit (WalletConnect) hosts, limited to the ones the modal and a pairing were observed to use, plus
// chain RPC for after a wallet connects. Relay and verify: pairing and signing requests. API: wallet list and
// project config. Fonts: the modal's typeface.
const REOWN_CONNECT = [
  "https://api.web3modal.org",
  "https://relay.walletconnect.org", "wss://relay.walletconnect.org",
  "https://pulse.walletconnect.org",
  "https://verify.walletconnect.org",
  "https://rpc.walletconnect.org",
  "https://keys.walletconnect.org",
  "https://bsc-dataseed.bnbchain.org",
].join(" ");
const REOWN_IMG = "https://api.web3modal.org https://walletconnect.org https://secure.walletconnect.org";
const REOWN_FONT = "https://fonts.reown.com";
const REOWN_FRAME = "'self' https://verify.walletconnect.org https://secure.walletconnect.org";

/** A fresh nonce per request for a strict Content-Security-Policy (AGENTS.md section 4, item 13). */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const agent = process.env.NEXT_PUBLIC_AGENT_URL ?? "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Reown AppKit injects its theme as <style> elements and style attributes without a nonce, and a nonce in
    // style-src makes browsers ignore 'unsafe-inline'. Styles only: script-src above stays nonce-based and strict.
    "style-src 'self' 'unsafe-inline'",
    // Token logos come from Binance's CDN as live data from the RWA API.
    `img-src 'self' data: blob: https://onchainos.bnbstatic.com https://financialmodelingprep.com ${REOWN_IMG}`,
    `font-src 'self' ${REOWN_FONT}`,
    `connect-src 'self' ${agent} ${REOWN_CONNECT}`.trim().replace(/\s+/g, " "),
    // The wallet modal shows the wallet's own verification page and the relay's verify frame.
    `frame-src ${REOWN_FRAME}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  // Claims are refused in restricted jurisdictions, using the country the edge network reports.
  let res: NextResponse;
  const path = request.nextUrl.pathname;
  if (path === "/claim" || path.startsWith("/claim/")) {
    const v = regionVerdict(request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry"), request.headers.get("x-vercel-ip-country-region"));
    headers.set("x-claim-region", v.blocked ? "blocked" : v.known ? "allowed" : "unknown");
    res = v.blocked && path !== "/claim/restricted"
      ? NextResponse.rewrite(new URL("/claim/restricted", request.url), { request: { headers }, status: 451 })
      : NextResponse.next({ request: { headers } });
  } else {
    res = NextResponse.next({ request: { headers } });
  }
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
