"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (...a: unknown[]) => void): void;
  removeListener?(event: string, cb: (...a: unknown[]) => void): void;
}
declare global {
  interface Window { ethereum?: Eip1193 }
}

interface WalletState {
  account: string | null;
  onBsc: boolean;
  available: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  send: (tx: Record<string, string>) => Promise<string>;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chain, setChain] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eth = window.ethereum;
    setAvailable(Boolean(eth));
    if (!eth) return;
    const onAcc = (a: unknown) => setAccount(Array.isArray(a) && typeof a[0] === "string" ? a[0] : null);
    const onChain = (c: unknown) => setChain(typeof c === "string" ? c : null);
    eth.request({ method: "eth_accounts" }).then(onAcc).catch(() => undefined);
    eth.request({ method: "eth_chainId" }).then(onChain).catch(() => undefined);
    eth.on?.("accountsChanged", onAcc);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAcc);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setError("No wallet was found in this browser. Open Bitstock inside your wallet app's browser.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAccount(accounts[0] ?? null);
      const c = (await eth.request({ method: "eth_chainId" })) as string;
      if (c !== "0x38") await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
      setChain("0x38");
    } catch (e) {
      setError(walletMessage(e, "Your wallet did not connect. Try again."));
    } finally {
      setConnecting(false);
    }
  }, []);

  const send = useCallback(async (tx: Record<string, string>) => {
    const eth = window.ethereum;
    if (!eth) throw new Error("No wallet is available.");
    return (await eth.request({ method: "eth_sendTransaction", params: [tx] })) as string;
  }, []);

  return <Ctx.Provider value={{ account, onBsc: chain === "0x38", available, connecting, error, connect, send }}>{children}</Ctx.Provider>;
}

/** Plain words for what a wallet reported; raw wallet errors are not shown to people. */
export function walletMessage(e: unknown, fallback: string): string {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (code === 4001 || code === "ACTION_REJECTED") return "You cancelled in your wallet. Nothing was sent.";
  if (code === 4902) return "Add BNB Smart Chain to your wallet, then try again.";
  if (code === -32002) return "Your wallet is already asking you something. Open it to continue.";
  const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string" ? (e as { message: string }).message : "";
  if (/insufficient funds/i.test(msg)) return "Your wallet does not have enough BNB for the network fee.";
  if (/reject|denied|cancel/i.test(msg)) return "You cancelled in your wallet. Nothing was sent.";
  return fallback;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
