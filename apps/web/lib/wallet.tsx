"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createAppKit, useAppKit, useAppKitAccount, useAppKitEvents, useAppKitNetwork, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import { bsc } from "@reown/appkit/networks";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";

/** BNB Smart Chain is the only chain Bitstock works on. */
const BSC_CHAIN_ID = 56;

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface WalletState {
  account: string | null;
  onBsc: boolean;
  available: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (tx: Record<string, string>) => Promise<string>;
}

const Ctx = createContext<WalletState | null>(null);

const NOT_CONFIGURED = "Wallet connection is not set up on this site yet. Please try again later.";
const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

let started = false;
/** Starts AppKit once, in the browser only. The project ID comes from configuration, never from code. */
function startAppKit(): void {
  if (started || typeof window === "undefined" || !projectId) return;
  started = true;
  const origin = window.location.origin;
  createAppKit({
    adapters: [new EthersAdapter()],
    networks: [bsc],
    defaultNetwork: bsc,
    projectId,
    metadata: {
      name: "Bitstock",
      description: "Checks the market, the token and a test run before every small buy of a tokenized stock.",
      url: origin,
      icons: [`${origin}/icon.svg`],
    },
    // Wallets only: no email or social sign-in, no analytics, no on-ramp or swaps inside the modal.
    features: { analytics: false, email: false, socials: false, onramp: false, swaps: false, send: false, history: false },
    enableWalletGuide: false,
    allowUnsupportedChain: false,
  });
}
startAppKit();

export function WalletProvider({ children }: { children: ReactNode }) {
  // AppKit hooks throw until createAppKit has run, and it only runs in the browser. So the server render and the
  // first client render use the inert state below, and the real provider takes over right after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && projectId ? <Connected>{children}</Connected> : <Inert missing={!projectId}>{children}</Inert>;
}

function Inert({ children, missing }: { children: ReactNode; missing: boolean }) {
  const value = useMemo<WalletState>(
    () => ({
      account: null,
      onBsc: false,
      available: false,
      connecting: false,
      error: missing ? NOT_CONFIGURED : null,
      connect: async () => undefined,
      disconnect: async () => undefined,
      send: async () => {
        throw new Error(missing ? NOT_CONFIGURED : "No wallet is connected.");
      },
    }),
    [missing],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function Connected({ children }: { children: ReactNode }) {
  const { open } = useAppKit();
  const { disconnect: appKitDisconnect } = useDisconnect();
  const { address, isConnected, status } = useAppKitAccount({ namespace: "eip155" });
  const { chainId } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider<Eip1193>("eip155");
  const events = useAppKitEvents();
  const [error, setError] = useState<string | null>(null);

  // A wallet that connected on another chain is told once, plainly, and can switch inside the modal.
  const account = isConnected && address ? address : null;
  const onBsc = account !== null && Number(chainId) === BSC_CHAIN_ID;

  useEffect(() => {
    const name = events.data?.event;
    if (name === "CONNECT_SUCCESS") setError(null);
    if (name === "CONNECT_ERROR") setError("Your wallet did not connect. Try again.");
  }, [events]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await open({ view: account ? "Account" : "Connect", namespace: "eip155" });
    } catch (e) {
      setError(walletMessage(e, "Your wallet did not connect. Try again."));
    }
  }, [open, account]);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await appKitDisconnect({ namespace: "eip155" });
    } catch (e) {
      setError(walletMessage(e, "Your wallet could not be disconnected. Try again."));
    }
  }, [appKitDisconnect]);

  const send = useCallback(
    async (tx: Record<string, string>) => {
      if (!walletProvider || !account) throw new Error("No wallet is connected.");
      if (!onBsc) throw Object.assign(new Error("Switch to BNB Smart Chain."), { code: 4902 });
      return (await walletProvider.request({ method: "eth_sendTransaction", params: [tx] })) as string;
    },
    [walletProvider, account, onBsc],
  );

  const value = useMemo<WalletState>(
    () => ({ account, onBsc, available: true, connecting: status === "connecting", error, connect, disconnect, send }),
    [account, onBsc, status, error, connect, disconnect, send],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
