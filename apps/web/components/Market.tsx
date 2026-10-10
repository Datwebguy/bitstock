"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, trimDecimal, when, type MarketView } from "@/lib/api";

function sessionView(s: MarketView["session"]): { cls: string; label: string; detail: string } {
  const v = s.value;
  if (!v) return { cls: "idle", label: "Unavailable", detail: "The market status could not be read, so Bitstock would wait." };
  const code = v.reasonCode ?? "";
  if (code === "ASSET_PAUSED") return { cls: "bad", label: "Paused by issuer", detail: v.reasonMsg ? `Reason given: ${v.reasonMsg}.` : "No reason was given." };
  if (code === "MARKET_PAUSED" || code === "MARKET_MAINTENANCE") return { cls: "bad", label: "Market paused", detail: "Trading in the underlying market is paused." };
  if (code === "ASSET_LIMITED") return { cls: "warn", label: "Limited", detail: v.reasonMsg === "earnings" ? "Limited around an earnings release." : "Trading is limited." };
  if (!v.openState) return { cls: "warn", label: "Closed", detail: v.nextOpenTime ? `Opens ${when(new Date(Number(v.nextOpenTime)).toISOString())}.` : "The next opening time was not given." };
  if (code === "TRADING") return { cls: "good", label: "Trading", detail: "Binance reports this token as trading." };
  return { cls: "warn", label: "Unrecognised", detail: `Status code ${code || "none"}.` };
}

export function MarketHud() {
  const [m, setM] = useState<MarketView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<MarketView>("/market")
        .then((v) => alive && (setM(v), setErr(null)))
        .catch((e: Error) => alive && setErr(e.message))
        .finally(() => alive && setLoading(false));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (loading && !m) return <div className="card" aria-busy="true"><span className="skeleton" /> <span className="sr-only">Loading live data</span></div>;
  if (!m) return <p className="msg error" role="alert">Live data is unavailable: {err}</p>;

  const s = sessionView(m.session);
  const price = trimDecimal(m.tokenPrice.value, 2);
  const mult = m.multiplier.value;
  const pending = mult && mult.pending !== mult.current && mult.effectiveAt !== "0";
  const ref = m.reference.value;
  const gap = m.gapPercent.value;
  const lastClose = ref ? !(ref.session === "regular") : false;

  return (
    <div className="grid">
      <section className="card card-hero" aria-labelledby="tok">
        <div className="token">
          {m.token.logo ? <img src={m.token.logo} alt="" width={44} height={44} /> : <span className="token-fallback" aria-hidden="true">N</span>}
          <div>
            <h2 id="tok" className="sr-only">Token</h2>
            <div className="check-name">{m.token.name ?? "unavailable"}</div>
            <div className="muted small">{m.token.symbol} · {m.token.ticker ?? "ticker unavailable"} on BNB Smart Chain</div>
          </div>
        </div>
        <p className="price num" aria-live="polite">{price ? `$${price}` : "unavailable"}</p>
        <span className="muted small">price per token</span>
        <span className="source">Source: {m.tokenPrice.source}, as of {when(m.tokenPrice.asOf)}{m.tokenPrice.error ? `. Unavailable: ${m.tokenPrice.error}` : ""}</span>
        <div className="chips">
          <Link className="btn btn-primary btn-inline" href="/buy">Check a buy</Link>
        </div>
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="ses">
          <div className="stat-label" id="ses">Market session</div>
          <div className="stat-value"><span className={`pill ${s.cls}`}>{s.label}</span></div>
          <p className="small">{s.detail}</p>
          <span className="source">Source: {m.session.source}, as of {when(m.session.asOf)}</span>
        </section>

        <section className="card" aria-labelledby="mul">
          <div className="stat-label" id="mul">Shares per token</div>
          <div className="stat-value num">{mult ? trimDecimal(mult.current, 6) : "unavailable"}</div>
          <p className="small">{mult ? (pending ? `A change to ${trimDecimal(mult.pending, 6)} is scheduled for ${when(new Date(Number(mult.effectiveAt) * 1000).toISOString())}.` : "No change is scheduled.") : "The token contract could not be read."}</p>
          <span className="source">Source: {m.multiplier.source}, as of {when(m.multiplier.asOf)}</span>
        </section>

        <section className="card" aria-labelledby="ref">
          <div className="stat-label" id="ref">{lastClose ? "Stock's last price" : "Stock price now"}</div>
          <div className="stat-value num">{ref ? `$${trimDecimal(ref.pricePerShare, 2)}` : "unavailable"}</div>
          <p className="small">{ref ? `${lastClose ? "Last traded" : "Traded"} ${when(ref.priceTime)}. An independent price, not taken from the token.` : "No independent price could be read; a buy would get a tighter limit."}</p>
          <span className="source">Source: {m.reference.source}</span>
        </section>

        <section className="card" aria-labelledby="gap">
          <div className="stat-label" id="gap">Token vs stock</div>
          <div className="stat-value num">{gap ? `${gap.startsWith("-") ? "" : "+"}${gap}%` : "unavailable"}</div>
          <p className="small">{gap ? `The token's price per share is ${gap.startsWith("-") ? "below" : "above"} the stock's ${lastClose ? "last price" : "price"}.` : "Needs both prices and the multiplier."}</p>
          <span className="source">Computed from the token price per share and the independent price.</span>
        </section>
      </div>
    </div>
  );
}
