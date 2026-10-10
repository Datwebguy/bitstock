"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, trimDecimal, when, type MarketView } from "@/lib/api";
import { LogoMark } from "./Logo";
import { Reveal } from "./Reveal";

function useMarket() {
  const [m, setM] = useState<MarketView | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => api<MarketView>("/market").then((v) => alive && (setM(v), setErr(false))).catch(() => alive && setErr(true));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { m, err };
}

function sessionWord(m: MarketView | null): { text: string; cls: string } {
  const v = m?.session.value;
  if (!v) return { text: "unavailable", cls: "idle" };
  if (v.reasonCode === "ASSET_PAUSED") return { text: "paused by issuer", cls: "bad" };
  if (v.reasonCode === "MARKET_PAUSED" || v.reasonCode === "MARKET_MAINTENANCE") return { text: "market paused", cls: "bad" };
  if (!v.openState) return { text: "closed", cls: "warn" };
  return { text: "trading", cls: "good" };
}

/** The hero's console: the checks Bitstock runs, filled with live values as they arrive. */
function CheckConsole({ m, err }: { m: MarketView | null; err: boolean }) {
  const s = sessionWord(m);
  const mult = m?.multiplier.value ? trimDecimal(m.multiplier.value.current, 6) : null;
  const ref = m?.reference.value;
  const gap = m?.gapPercent.value;
  const pending = m?.multiplier.value && m.multiplier.value.pending !== m.multiplier.value.current && m.multiplier.value.effectiveAt !== "0";
  const rows: Array<{ k: string; v: string; cls: string }> = [
    { k: "Market session", v: m ? s.text : "reading…", cls: m ? s.cls : "idle" },
    { k: "Shares per token", v: mult ? `${mult}${pending ? " · change scheduled" : " · no change scheduled"}` : m ? "unavailable" : "reading…", cls: mult ? (pending ? "warn" : "good") : "idle" },
    { k: "Independent price", v: ref ? `$${trimDecimal(ref.pricePerShare, 2)} · ${ref.session === "regular" ? "live" : "last close"}` : m ? "unavailable" : "reading…", cls: ref ? (ref.session === "regular" ? "good" : "warn") : "idle" },
    { k: "Token vs stock", v: gap ? `${gap.startsWith("-") ? "" : "+"}${gap}%` : m ? "unavailable" : "reading…", cls: gap ? "good" : "idle" },
    { k: "Your trade, dry-run", v: "runs when you check a buy", cls: "idle" },
  ];
  return (
    <div className="console" role="group" aria-label="Live checks for NVDAB">
      <div className="console-head">
        <span className="dots" aria-hidden="true"><i /><i /><i /></span>
        <span>NVDAB · live checks</span>
        <span className={`live ${err ? "off" : ""}`}>{err ? "offline" : "live"}</span>
      </div>
      <ol className="console-rows">
        {rows.map((r, i) => (
          <li key={r.k} className={`console-row d${i + 1}`}>
            <span className={`tick ${r.cls}`} aria-hidden="true">
              <svg viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.4 12.6 4.8" /></svg>
            </span>
            <span className="console-k">{r.k}</span>
            <span className="console-v num">{r.v}</span>
          </li>
        ))}
      </ol>
      <div className="console-foot">{m ? `Read ${when(m.session.asOf)} · sources shown on every screen` : "Reading live data…"}</div>
    </div>
  );
}

function Ticker({ m }: { m: MarketView | null }) {
  if (!m) return null;
  const items = [
    ["NVDAB", m.tokenPrice.value ? `$${trimDecimal(m.tokenPrice.value, 2)}` : "unavailable"],
    ["Shares per token", m.multiplier.value ? trimDecimal(m.multiplier.value.current, 6) ?? "unavailable" : "unavailable"],
    [m.reference.value?.session === "regular" ? "NVDA now" : "NVDA last close", m.reference.value ? `$${trimDecimal(m.reference.value.pricePerShare, 2)}` : "unavailable"],
    ["Token vs stock", m.gapPercent.value ? `${m.gapPercent.value.startsWith("-") ? "" : "+"}${m.gapPercent.value}%` : "unavailable"],
    ["Market", sessionWord(m).text],
    ["52-week range", m.marketData.value?.low52W && m.marketData.value?.high52W ? `$${trimDecimal(m.marketData.value.low52W, 2)} – $${trimDecimal(m.marketData.value.high52W, 2)}` : "unavailable"],
  ];
  const strip = items.map(([k, v]) => (
    <span className="tick-item" key={k}>
      <b>{k}</b> <span className="num">{v}</span>
    </span>
  ));
  return (
    <div className="ticker" aria-label="Live figures">
      <div className="ticker-track">
        <div className="ticker-set">{strip}</div>
        <div className="ticker-set" aria-hidden="true">{strip}</div>
      </div>
    </div>
  );
}

const STEPS = [
  { n: "01", t: "Check", d: "Market session, share multiplier, an independent stock price, the price impact of your exact amount, and a dry run of the real trade." },
  { n: "02", t: "Buy", d: "Only when the checks allow it. With a warning, the price limit gets tighter. You sign in your own wallet; Bitstock never holds your keys." },
  { n: "03", t: "Explain", d: "Your tokens shown as shares, with what changes them in plain words: dividends, splits and pauses." },
];

const CHECKS = [
  { t: "Market session", d: "Is the stock trading, closed, limited or paused by its issuer?" },
  { t: "Share multiplier", d: "Is a corporate action about to change what one token stands for?" },
  { t: "Independent price", d: "Is the token's price close to the real stock price, from a separate source?" },
  { t: "Price and route", d: "How much would your exact amount move the price, on a route that can be tested?" },
  { t: "Dry run", d: "Does the exact transaction succeed, and do the tokens arrive in your wallet?" },
];

const FAQ = [
  { q: "Do I need to give Bitstock my keys?", a: "No. Bitstock prepares and tests the transaction; you approve and sign it in your own wallet." },
  { q: "What if the market is closed?", a: "Tokenized stocks can trade on chain when Wall Street is shut. Bitstock warns you, compares with the last close, and only allows a tighter price limit." },
  { q: "Can it lose money?", a: "Yes. Prices move. Bitstock checks for avoidable problems before you buy; it does not promise profit or protect you from loss. It is not investment advice." },
  { q: "What do I actually own?", a: "A token on BNB Smart Chain that stands for a number of shares. Its issuer can pause or block it. Holdings shows you the shares in plain words." },
];

export function Landing() {
  const { m, err } = useMarket();
  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-bg" aria-hidden="true">
          <div className="aurora a1" />
          <div className="aurora a2" />
          <div className="aurora a3" />
          <div className="gridlines" />
          <div className="candles">
            {Array.from({ length: 9 }).map((_, i) => <span key={i} className={`candle c${i + 1}`} />)}
          </div>
        </div>
        <div className="hero-in">
          <div className="hero-copy">
            <p className="kicker"><LogoMark size={18} /> Tokenized stocks on BNB Smart Chain</p>
            <h1 id="hero-title" className="hero-title">
              Buy real stocks on chain.
              <span className="hl"> Only after the checks pass.</span>
            </h1>
            <p className="hero-sub">Bitstock reads the market, the token, an independent stock price and a dry run of your exact trade, shows you every result, then lets you buy a small amount in your own wallet.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-glow" href="/buy">Try a protected buy</Link>
              <Link className="btn btn-ghost" href="/check">See live checks</Link>
            </div>
            <p className="hero-note">No keys leave your wallet · every buy dry-run first · every transaction public on BscScan</p>
          </div>
          <CheckConsole m={m} err={err} />
        </div>
      </section>

      <Ticker m={m} />

      <section className="band" aria-labelledby="how">
        <Reveal>
          <p className="eyebrow center">How it works</p>
          <h2 id="how" className="section-title">Check. Buy. Understand.</h2>
        </Reveal>
        <div className="flow">
          <svg className="flow-line" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true"><path d="M0 4 H1000" /></svg>
          {STEPS.map((s, i) => (
            <Reveal key={s.n} className={`flow-step s${i + 1}`}>
              <span className="flow-n">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="band" aria-labelledby="five">
        <Reveal>
          <p className="eyebrow center">Before every buy</p>
          <h2 id="five" className="section-title">Five checks, all shown to you</h2>
        </Reveal>
        <div className="checks-grid">
          {CHECKS.map((c, i) => (
            <Reveal key={c.t} className="check-card">
              <span className="check-num">{i + 1}</span>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="outcomes">
          <span className="pill good">Go</span>
          <span className="pill warn">Go, with a tighter limit</span>
          <span className="pill idle">Wait</span>
          <span className="pill bad">Do not buy now</span>
        </Reveal>
      </section>

      <section className="band" aria-labelledby="honest">
        <Reveal className="honest">
          <div>
            <p className="eyebrow">Straight talk</p>
            <h2 id="honest" className="section-title left">It would rather wait than buy at a bad time.</h2>
            <p className="muted">Missing, stale or contradictory data never becomes a guess. Bitstock waits or declines, and tells you why in one sentence.</p>
          </div>
          <ul className="honest-list">
            <li><b>Never holds your money or keys.</b> You sign every buy.</li>
            <li><b>Never trades for you uninvited.</b> Nothing happens without your approval.</li>
            <li><b>Never promises profit.</b> It removes avoidable mistakes, not market risk.</li>
            <li><b>Never hides a number&apos;s source.</b> Each value says where and when it was read.</li>
          </ul>
        </Reveal>
      </section>

      <section className="band" aria-labelledby="faq">
        <Reveal>
          <h2 id="faq" className="section-title">Questions</h2>
        </Reveal>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta-band" aria-labelledby="go">
        <div className="hero-bg" aria-hidden="true"><div className="aurora a1" /><div className="gridlines" /></div>
        <Reveal className="cta-in">
          <LogoMark size={44} />
          <h2 id="go" className="section-title">Start with a dollar.</h2>
          <p className="muted">Check NVDAB live, then buy a small amount when the checks allow it.</p>
          <div className="hero-cta center">
            <Link className="btn btn-primary btn-glow" href="/buy">Try a protected buy</Link>
            <Link className="btn btn-ghost" href="/check">See live checks</Link>
          </div>
        </Reveal>
      </section>

      <p className="footer-note">Bitstock is not investment advice. Tokenized stocks can be paused or blocked by their issuer.</p>
    </div>
  );
}
