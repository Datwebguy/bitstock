"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fromLine, trimDecimal, when, type MarketView } from "@/lib/api";
import { StockList, StockLogo, StockPicker, useSelectedSymbol, useTokens } from "./Stocks";

function sessionView(s: MarketView["session"]): { cls: string; label: string; detail: string } {
  const v = s.value;
  if (!v) return { cls: "idle", label: "Unavailable", detail: "Bitstock could not read whether the market is open, so it would wait." };
  const code = v.reasonCode ?? "";
  if (code === "ASSET_PAUSED") return { cls: "bad", label: "Paused by the company", detail: v.reasonMsg ? `The company that issues this token paused it (${v.reasonMsg.replace(/_/g, " ")}).` : "The company that issues this token paused it and gave no reason." };
  if (code === "MARKET_PAUSED" || code === "MARKET_MAINTENANCE") return { cls: "bad", label: "Paused", detail: "Trading in this stock is paused." };
  if (code === "ASSET_LIMITED") return { cls: "warn", label: "Limited", detail: v.reasonMsg === "earnings" ? "Trading is limited around the company's earnings news." : "Trading is limited for now." };
  if (!v.openState) return { cls: "warn", label: "Closed", detail: v.nextOpenTime ? `The US stock market is closed. It opens ${when(new Date(Number(v.nextOpenTime)).toISOString())}.` : "The US stock market is closed. The token can still trade on chain." };
  if (code === "TRADING") return { cls: "good", label: "Trading", detail: "Binance shows this stock as open for trading." };
  return { cls: "warn", label: "Unclear", detail: "Binance shows a status Bitstock does not recognise, so it would be careful." };
}

function Hud({ symbol, address }: { symbol: string; address: string }) {
  const [m, setM] = useState<MarketView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setM(null);
    const load = () =>
      api<MarketView>(`/market?token=${address}`)
        .then((v) => alive && (setM(v), setErr(null)))
        .catch((e: Error) => alive && setErr(e.message))
        .finally(() => alive && setLoading(false));
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [address]);

  if (loading && !m) return <div className="card" aria-busy="true"><span className="skeleton" /> <span className="sr-only">Loading live data</span></div>;
  if (!m) return <p className="msg error" role="alert">Live data is unavailable right now. {err}</p>;

  const s = sessionView(m.session);
  const price = trimDecimal(m.tokenPrice.value, 2);
  const mult = m.multiplier.value;
  const pending = mult && mult.pending !== mult.current && mult.effectiveAt !== "0";
  const ref = m.reference.value;
  const gap = m.gapPercent.value;
  const lastClose = ref ? !(ref.session === "regular") : false;
  const stock = m.token.ticker ?? symbol;

  return (
    <div className="grid">
      <section className="card card-hero" aria-labelledby="tok">
        <div className="token">
          <StockLogo t={{ logo: m.token.logo, symbol }} size={44} />
          <div>
            <h2 id="tok" className="check-name">{m.token.company ?? m.token.name ?? symbol}</h2>
            <div className="muted small">{symbol} · tracks {stock} · on BNB Smart Chain</div>
          </div>
        </div>
        <p className="price num" aria-live="polite">{price ? `$${price}` : "unavailable"}</p>
        <span className="muted small">price per token</span>
        <span className="source">{fromLine(m.tokenPrice.source, m.tokenPrice.asOf)}{m.tokenPrice.error ? " · unavailable right now" : ""}</span>
        <div className="chips">
          <Link className="btn btn-primary btn-inline" href={`/buy?s=${symbol}`}>Check a buy of {stock}</Link>
        </div>
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="ses">
          <div className="stat-label" id="ses">Stock market</div>
          <div className="stat-value"><span className={`pill ${s.cls}`}>{s.label}</span></div>
          <p className="small">{s.detail}</p>
          <span className="source">{fromLine(m.session.source, m.session.asOf)}</span>
        </section>

        <section className="card" aria-labelledby="mul">
          <div className="stat-label" id="mul">Shares per token</div>
          <div className="stat-value num">{mult ? trimDecimal(mult.current, 6) : "unavailable"}</div>
          <p className="small">{mult ? (pending ? `This will change to ${trimDecimal(mult.pending, 6)} on ${when(new Date(Number(mult.effectiveAt) * 1000).toISOString())}, usually because of a company event.` : "No change is planned.") : "Could not be read right now."}</p>
          <span className="source">{fromLine(m.multiplier.source, m.multiplier.asOf)}</span>
        </section>

        <section className="card" aria-labelledby="ref">
          <div className="stat-label" id="ref">{lastClose ? `${stock} last price` : `${stock} price now`}</div>
          <div className="stat-value num">{ref ? `$${trimDecimal(ref.pricePerShare, 2)}` : "unavailable"}</div>
          <p className="small">{ref ? `${lastClose ? "Last traded" : "Traded"} ${when(ref.priceTime)}. The real stock's price, from a separate source.` : "The real stock's price could not be read; a buy would get a tighter limit."}</p>
          <span className="source">{fromLine(m.reference.source)}</span>
        </section>

        <section className="card" aria-labelledby="gap">
          <div className="stat-label" id="gap">Token vs the real stock</div>
          <div className="stat-value num">{gap ? `${gap.startsWith("-") ? "" : "+"}${gap}%` : "unavailable"}</div>
          <p className="small">{gap ? `Per share, the token costs ${gap.startsWith("-") ? "less" : "more"} than the stock's ${lastClose ? "last price" : "price"}.` : "Needs both prices and the shares per token."}</p>
          <span className="source">Worked out by Bitstock from the two prices above</span>
        </section>
      </div>
    </div>
  );
}

export function MarketHud() {
  const { list, err } = useTokens();
  const [symbol, setSymbol] = useSelectedSymbol();
  const tokens = list?.tokens ?? null;
  const t = tokens?.find((x) => x.symbol === symbol) ?? null;
  const pick = (s: string) => {
    setSymbol(s);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <>
      <StockPicker tokens={tokens} symbol={symbol} onPick={setSymbol} />
      {err && !tokens ? <p className="msg error" role="alert">The list of stocks is unavailable right now. {err}</p> : null}
      {tokens && !t ? <p className="msg info">{symbol} is not listed on Binance right now. Choose another stock.</p> : null}
      {t ? <Hud key={t.address} symbol={t.symbol} address={t.address} /> : null}
      {tokens ? (
        <section className="card all-stocks" aria-labelledby="all">
          <h2 id="all">All {tokens.length} tokenized stocks</h2>
          <p className="small muted">Live from Binance. Tap one to check it.</p>
          <StockList tokens={tokens} current={symbol} onPick={pick} />
        </section>
      ) : null}
    </>
  );
}
