"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, trimDecimal, when, type MarketView, type ListedToken } from "@/lib/api";
import { LogoMark } from "./Logo";
import { Coin, ScrollLit, SplitReveal, TypeCycle, VelocityBand } from "./Motion";
import { Reveal } from "./Reveal";
import { useTokens } from "./Stocks";

function useMarket(address: string | null) {
  const [m, setM] = useState<MarketView | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!address) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (): void => {
      api<MarketView>(`/market?token=${address}`)
        .then((v) => alive && (setM(v), setErr(false)))
        .catch(() => {
          if (!alive) return;
          setErr(true);
          retry = setTimeout(load, 5000); // one quick retry after a hiccup, then the regular refresh
        });
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
      if (retry) clearTimeout(retry);
    };
  }, [address]);
  return { m, err };
}

function sessionWord(m: MarketView | null): { text: string; cls: string } {
  const v = m?.session.value;
  if (!v) return { text: "unavailable", cls: "idle" };
  if (v.reasonCode === "ASSET_PAUSED") return { text: "paused by the company", cls: "bad" };
  if (v.reasonCode === "MARKET_PAUSED" || v.reasonCode === "MARKET_MAINTENANCE") return { text: "market paused", cls: "bad" };
  if (!v.openState) return { text: "US market closed", cls: "warn" };
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
    { k: "Stock market", v: m ? s.text : "reading…", cls: m ? s.cls : "idle" },
    { k: "Shares per token", v: mult ? `${mult}${pending ? " · change planned" : " · no change planned"}` : m ? "unavailable" : "reading…", cls: mult ? (pending ? "warn" : "good") : "idle" },
    { k: `${m?.token.ticker ?? "Stock"} real price`, v: ref ? `$${trimDecimal(ref.pricePerShare, 2)} · ${ref.session === "regular" ? "live" : "last close"}` : m ? "unavailable" : "reading…", cls: ref ? (ref.session === "regular" ? "good" : "warn") : "idle" },
    { k: "Token vs stock", v: gap ? `${gap.startsWith("-") ? "" : "+"}${gap}%` : m ? "unavailable" : "reading…", cls: gap ? (ref?.session === "regular" && Math.abs(Number(gap)) <= 0.5 ? "good" : "warn") : "idle" },
    { k: "Test run of your trade", v: "runs when you check a buy", cls: "idle" },
  ];
  return (
    <div className="console" role="group" aria-label={`Live checks for ${m?.token.symbol ?? "a tokenized stock"}`}>
      <div className="console-head">
        <span className="dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{m ? `${m.token.company ?? m.token.symbol} (${m.token.symbol}) · live checks` : "Live checks"}</span>
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
      <div className="console-foot">{m ? `Read live ${when(m.session.asOf)}` : "Reading live data…"}</div>
    </div>
  );
}

function Ticker({ tokens }: { tokens: ListedToken[] | null }) {
  if (!tokens || tokens.length === 0) return null;
  const strip = tokens.map((t) => (
    <a className="tick-item" key={t.address} href={`/check?s=${t.symbol}`} tabIndex={-1}>
      <b>{t.ticker ?? t.symbol}</b> <span className="num">{t.price ? `$${trimDecimal(t.price, 2)}` : "unavailable"}</span>
    </a>
  ));
  return (
    <div className="ticker" aria-label={`Live prices of ${tokens.length} tokenized stocks`}>
      <div className="ticker-track long">
        <div className="ticker-set">{strip}</div>
        <div className="ticker-set" aria-hidden="true">{strip}</div>
      </div>
    </div>
  );
}

const STEPS = [
  { n: "01", t: "Check", d: "Is the market open, what one token stands for, the real stock's price, how much your amount moves the price, and a test run of your exact trade." },
  { n: "02", t: "Buy", d: "Only when the checks allow it. With a warning, the price limit gets tighter. You sign in your own wallet; Bitstock never holds your keys." },
  { n: "03", t: "Explain", d: "Your tokens shown as shares, with what changes them in plain words: dividends, splits and pauses." },
];

const CHECKS = [
  { t: "Stock market", d: "Is the stock trading, closed, limited or paused by the company?" },
  { t: "Shares per token", d: "Is a company event, like a dividend or split, about to change what one token stands for?" },
  { t: "Price vs the real stock", d: "Is the token's price close to the real stock's price, from a separate source?" },
  { t: "Price impact", d: "How much would your exact amount move the price?" },
  { t: "Test run", d: "Does your exact trade work, and do the tokens arrive in your wallet?" },
];

const FAQ = [
  { q: "Do I need to give Bitstock my keys?", a: "No. Bitstock prepares and tests the transaction; you approve and sign it in your own wallet." },
  { q: "What if the market is closed?", a: "Tokenized stocks can trade on chain when the US stock market is shut. Bitstock warns you, compares with the stock's last price, and only allows a tighter price limit." },
  { q: "Which stocks can I buy?", a: "Every tokenized stock Binance lists on BNB Smart Chain right now. The list is read live, so it changes when Binance's list changes. Open Check to browse and search all of it." },
  { q: "Can it lose money?", a: "Yes. Prices move. Bitstock checks for avoidable problems before you buy; it does not promise profit or protect you from loss. It is not investment advice." },
  { q: "What do I actually own?", a: "A token on BNB Smart Chain that stands for a number of shares. The company that issues it can pause or block it. Holdings shows you the shares in plain words." },
];

export function Landing() {
  const { list } = useTokens();
  const featured = list?.tokens.find((t) => t.symbol === list.featured)?.address ?? null;
  const { m, err } = useMarket(featured);
  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-in">
          <div className="hero-copy">
            <p className="kicker"><span className="roll"><LogoMark size={18} /></span> Tokenized stocks on BNB Smart Chain</p>
            <h1 id="hero-title" className="hero-title">
              Buy tokenized stocks on chain.
              <span className="hl"> Only after the checks pass.</span>
            </h1>
            <TypeCycle label="Bitstock checks the market, what one token stands for, the real stock's price, your trade size and a test run." phrases={["Checking the stock market…", "Reading shares per token…", "Comparing the real stock price…", "Measuring your exact trade…", "Test-running your trade…", "Showing you every result."]} />
            <p className="hero-sub">Pick from every tokenized stock on Binance. Bitstock reads the market, the token, the real stock&apos;s price and a test run of your exact trade, shows you every result, then lets you buy a small amount in your own wallet.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-glow" href="/buy">Try a protected buy</Link>
              <Link className="btn btn-ghost" href="/check">See live checks</Link>
            </div>
            <p className="hero-note">Your keys stay in your wallet · every buy tested first · every buy public on BscScan</p>
          </div>
          <CheckConsole m={m} err={err} />
        </div>
      </section>

      <Ticker tokens={list?.tokens ?? null} />

      <section className="band" aria-labelledby="how">
        <p className="eyebrow center">How it works</p>
        <SplitReveal text="Check. Buy. Understand." className="section-title" />
        <span id="how" className="sr-only">How it works</span>
        <div className="flow">
          <svg className="flow-line" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true"><path d="M0 4 H1000" /></svg>
          <span className="flow-token" aria-hidden="true" />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} className={`flow-step s${i + 1}`}>
              <span className="flow-n">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="band statement" aria-label="What Bitstock believes">
        <ScrollLit text="A small buy deserves the same care as a big one. Read the market. Check the token. Compare the real stock's price. Test the exact trade. Then, and only then, buy." />
      </section>

      <VelocityBand words={["CHECK", "BUY", "EXPLAIN", "CHECK", "BUY", "EXPLAIN"]} />

      <section className="band" aria-labelledby="five">
        <p className="eyebrow center">Before every buy</p>
        <SplitReveal text="Five checks, all shown to you" className="section-title" />
        <span id="five" className="sr-only">Five checks</span>
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
            <li><b>Never hides where a number came from.</b> Each value says where and when it was read.</li>
          </ul>
        </Reveal>
      </section>

      <section className="band" aria-labelledby="faq">
        <SplitReveal text="Questions, answered plainly" className="section-title" />
        <span id="faq" className="sr-only">Questions</span>
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
        <Reveal className="cta-in">
          <Coin />
          <h2 id="go" className="section-title"><span className="gold">Start with a dollar.</span></h2>
          <p className="muted">Pick a stock, check it live, then buy a small amount when the checks allow it.</p>
          <div className="hero-cta center">
            <Link className="btn btn-primary btn-glow" href="/buy">Try a protected buy</Link>
            <Link className="btn btn-ghost" href="/check">See live checks</Link>
          </div>
        </Reveal>
      </section>

      <p className="footer-note"><a href="/about">About Bitstock</a> · <a href="/autopilot">Autopilot</a> · Bitstock is not investment advice. Tokenized stocks can be paused or blocked by the company that issues them.</p>
    </div>
  );
}
