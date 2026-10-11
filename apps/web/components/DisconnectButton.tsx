"use client";
import { useWallet } from "@/lib/wallet";

/** A visible way to disconnect the wallet, shown wherever the app says which wallet is connected. */
export function DisconnectButton() {
  const w = useWallet();
  if (!w.account) return null;
  return (
    <button type="button" className="btn btn-ghost btn-inline disconnect" onClick={() => void w.disconnect()}>
      Disconnect wallet
    </button>
  );
}
