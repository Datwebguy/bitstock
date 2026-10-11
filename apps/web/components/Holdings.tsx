"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fromLine, humanize, when, type Holdings, type Position } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { StockLogo } from "./Stocks";

const OUTCOME_WORD: Record<string, string> = { GO: "Go", LIMIT: "Go, tighter limit", WAIT: "Wait", BLOCK: "Do not buy now" };
const STATUS_WORD: Record<string, string> = { confirmed: "Done", reverted: "Cancelled", submitted: "On its way", prepared: "Not sent" };

function PositionCard({ p }: { p: Position }) {
  return (
    <section className="card" aria-label={p.token.company}>
      <div className="token">
        <StockLogo t={p.token} size={40} />
        <div>
          <div className="check-name">{p.token.company}</div>
          <div className="muted small">{p.token.symbol} · tracks {p.token.ticker ?? p.token.symbol}</div>
        </div>
      </div>
      <dl className="kv small">
        <dt>Shares you own</dt><dd className="num">{p.shares ?? "unavailable"}</dd>
        <dt>Tokens you hold</dt><dd className="num">{p.balance.tokens}</dd>
        <dt>Worth at the stock&apos;s price</dt><dd className="num">{p.valueAtReference.value ? `$${p.valueAtReference.value}` : "unavailable"}</dd>
      </dl>
      {p.valueAtReference.price ? <p className="small muted">Your shares × ${p.valueAtReference.price}, the stock&apos;s price {when(p.valueAtReference.priceTime)}. Not a price you can sell at.</p> : null}
      <p className="small">{p.multiplierExplanation ? humanize(p.multiplierExplanation) : "How many shares each token stands for could not be read right now."}</p>
      <span className="source">{fromLine(p.balance.source, p.balance.asOf)}{p.valueAtReference.price ? ` · stock price from ${fromLine(p.valueAtReference.source).slice(5)}` : ""}</span>
    </section>
  );
}

export function HoldingsView() {
  const w = useWallet();
  const [h, setH] = useState<Holdings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setH(null);
    setErr(null);
    if (!w.account) return;
    let alive = true;
    setLoading(true);
    api<Holdings>(`/holdings?wallet=${w.account}`)
      .then((v) => alive && (setH(v), setErr(null)))
      .catch((e: Error) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [w.account]);

  if (!w.account) {
    return (
      <section className="card">
        <p className="small muted">Connect the wallet you buy with to see your tokenized stocks as shares.</p>
        <button className="btn btn-primary" type="button" onClick={() => void w.connect()} disabled={w.connecting}>{w.connecting ? "Connecting…" : "Connect wallet"}</button>
        {w.error ? <p className="msg error" role="alert">{w.error}</p> : null}
      </section>
    );
  }
  if (loading && !h) return <div className="card" aria-busy="true"><span className="skeleton" /> <span className="sr-only">Loading your holdings</span></div>;
  if (!h) return <p className="msg error" role="alert">Your holdings are unavailable right now. {err}</p>;

  return (
    <div className="grid">
      <p className="small muted">Bitstock looked for all {h.checked} tokenized stocks in your wallet {when(h.asOf)}.{h.unread.length ? ` It could not read ${h.unread.length} of them right now (${h.unread.join(", ")}).` : ""}</p>
      {h.positions.length === 0 ? (
        <section className="card">
          <p className="small">You do not hold any tokenized stocks in this wallet yet.</p>
          <Link className="btn btn-primary btn-inline" href="/buy">Check a buy</Link>
        </section>
      ) : (
        <div className="grid grid-2">{h.positions.map((p) => <PositionCard key={p.token.address} p={p} />)}</div>
      )}

      <section className="card" aria-labelledby="buys">
        <h2 id="buys">Your buys through Bitstock</h2>
        {h.buys.length === 0 ? (
          <p className="small muted">No buys through Bitstock from this wallet yet.</p>
        ) : (
          <ul className="list">
            {h.buys.map((b) => (
              <li key={b.txHash}>
                <span>
                  <b>${b.amountUsd}{b.symbol ? ` of ${b.symbol}` : ""}</b> · {when(b.at)}
                  <span className="source">{OUTCOME_WORD[b.outcome] ?? b.outcome} · {STATUS_WORD[b.status] ?? b.status}</span>
                </span>
                <a className="small" href={`https://bscscan.com/tx/${b.txHash}`} target="_blank" rel="noopener noreferrer">View on BscScan</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
