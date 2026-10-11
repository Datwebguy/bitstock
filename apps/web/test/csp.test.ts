import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy.ts";

const csp = (path = "/buy") => proxy(new NextRequest(`https://bitstock.test${path}`)).headers.get("content-security-policy") ?? "";
const directive = (name: string, path?: string) => csp(path).split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("content security policy with the Reown wallet modal", () => {
  it("lets the page reach the WalletConnect relay (https and wss), API and verify hosts", () => {
    const c = directive("connect-src");
    for (const h of ["https://relay.walletconnect.org", "wss://relay.walletconnect.org", "https://api.web3modal.org", "https://verify.walletconnect.org", "https://pulse.walletconnect.org"]) expect(c).toContain(h);
  });
  it("allows the wallet logos and the modal font, and keeps the token-logo hosts", () => {
    expect(directive("img-src")).toContain("https://api.web3modal.org");
    expect(directive("img-src")).toContain("https://onchainos.bnbstatic.com");
    expect(directive("font-src")).toContain("https://fonts.reown.com");
  });
  it("keeps scripts strict: a per-request nonce, no unsafe-inline, no wildcard", () => {
    const s = directive("script-src");
    expect(s).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(s).not.toContain("unsafe-inline");
    expect(csp()).not.toMatch(/\s\*[\s;]/);
    expect(csp()).toContain("object-src 'none'");
    expect(csp()).toContain("frame-ancestors 'none'");
  });
  it("uses a different nonce on every request", () => {
    const n = () => /'nonce-([^']+)'/.exec(directive("script-src"))?.[1];
    expect(n()).not.toBe(n());
  });
});
