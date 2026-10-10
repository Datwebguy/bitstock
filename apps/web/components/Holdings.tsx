"use client";
import { useEffect, useState } from "react";
import { api, when, type Holdings } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

export function HoldingsView() {
  const w = useWallet();
  const [h, setH] = useState<Holdings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!w.account) return;
    setLoading(true);
    api<Holdings>(`/holdings?wallet=${w.account}`)
      .then((v) => (setH(v), setErr(null)))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [w.account]);

  if (!w.account) {
    return (
      <section className="card">
        <p className="small muted">Connect the wallet you buy with to see your NVDAB in shares.</p>
        <button className="btn btn-primary" type="button" onClick={() => void w.connect()} disabled={w.connecting}>{w.connecting ? "Connecting…" : "Connect wallet"}</button>
        {w.error ? <p className="msg error" role="alert">{w.error}</p> : null}
      </section>
    );
  }
  if (loading && !h) return <div className="card" aria-busy="true"><span className="skeleton" /> <span className="sr-only">Loading your holdings</span></div>;
  if (!h) return <p className="msg error" role="alert">Your holdings are unavailable: {err}</p>;

  return (
    <div className="grid">
      <section className="card card-hero" aria-labelledby="hold">
        <div className="stat-label" id="hold">You hold</div>
        <p className="price num">{h.shares ?? "unavailable"}</p>
        <span className="muted small">shares of NVIDIA, as {h.balance.tokens ?? "unavailable"} NVDAB tokens</span>
        <p className="small">{h.explanation ?? "Your balance or the share multiplier could not be read."}</p>
        <span className="source">Source: {h.balance.source} and {h.multiplier.source}, as of {when(h.balance.asOf)}</span>
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="val">
          <div className="stat-label" id="val">Worth at the stock&apos;s price</div>
          <div className="stat-value num">{h.valueAtReference.value ? `$${h.valueAtReference.value}` : "unavailable"}</div>
          <p className="small">{h.valueAtReference.price ? `Your shares × $${h.valueAtReference.price}, the stock's price at ${when(h.valueAtReference.priceTime)}. Not a price you can sell at.` : "No independent price is available right now."}</p>
          <span className="source">Source: {h.valueAtReference.source}</span>
        </section>
        <section className="card" aria-labelledby="mult">
          <div className="stat-label" id="mult">What happens to your token</div>
          <p className="small">{h.multiplierExplanation ?? "The share multiplier could not be read."}</p>
          <span className="source">Source: {h.multiplier.source}</span>
        </section>
      </div>

      <section className="card" aria-labelledby="buys">
        <h2 id="buys">Your Bitstock buys</h2>
        {h.buys.length === 0 ? (
          <p className="small muted">No buys through Bitstock from this wallet yet.</p>
        ) : (
          <ul className="list">
            {h.buys.map((b) => (
              <li key={b.txHash}>
                <span>
                  <b>${b.amountUsd}</b> · {when(b.at)}
                  <span className="source">Decision {b.outcome} · {b.status}</span>
                </span>
                <a className="small" href={`https://bscscan.com/tx/${b.txHash}`} target="_blank" rel="noopener noreferrer">BscScan</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
