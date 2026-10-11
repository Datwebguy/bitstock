import { NextResponse, type NextRequest } from "next/server";
import { regionVerdict } from "./lib/regions";

/** A fresh nonce per request for a strict Content-Security-Policy (AGENTS.md section 4, item 13). */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const agent = process.env.NEXT_PUBLIC_AGENT_URL ?? "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Token logos come from Binance's CDN as live data from the RWA API.
    "img-src 'self' data: https://onchainos.bnbstatic.com https://financialmodelingprep.com",
    "font-src 'self'",
    `connect-src 'self' ${agent}`.trim(),
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
