"use client";
import { useEffect, useState } from "react";
import { api, fromLine, when, type MarketView } from "@/lib/api";
import { StockPicker, useSelectedSymbol, useTokens } from "./Stocks";

// The repository the skill is installed from (owner/name), set at build time. Nothing is baked in.
const REPO = process.env.NEXT_PUBLIC_REPO ?? "";

const INSTALL = [
  "npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet",
  ...(REPO ? [`npx skills add ${REPO}/skills/bitstock-buy`] : []),
];

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="cmd">
      <code className="mono">{text}</code>
      <button
        type="button"
        className="chip"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Whether Binance reports a regular trading session for the chosen stock right now. */
function OpenWindow({ address, ticker }: { address: string; ticker: string }) {
  const [m, setM] = useState<MarketView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<MarketView>(`/market?token=${address}`)
        .then((v) => alive && (setM(v), setErr(null)))
        .catch((e: Error) => alive && setErr(e.message));
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [address]);
  if (!m) return <p className="small muted">{err ? `Market status unavailable right now. ${err}` : "Reading the market…"}</p>;
  const v = m.session.value;
  const regular = Boolean(v?.openState && v.marketStatus?.toLowerCase() === "regular");
  const next = v?.nextOpenTime ? when(new Date(Number(v.nextOpenTime)).toISOString()) : null;
  return (
    <>
      <div className="stat-value">
        <span className={`pill ${regular ? "good" : "warn"}`}>{regular ? "Regular session now" : "Not in a regular session"}</span>
      </div>
      <p className="small">
        {regular
          ? `Binance reports ${ticker} in its regular trading session. A scheduled buy runs its checks a set delay after the open.`
          : `A scheduled buy of ${ticker} waits until Binance reports a regular trading session${next ? ` (Binance says it opens ${next})` : ""}, then waits a short delay (15 minutes unless you change it) and runs every check again before asking you.`}
      </p>
      <span className="source">{fromLine(m.session.source, m.session.asOf)}</span>
    </>
  );
}

export function AutopilotView() {
  const { list } = useTokens();
  const [symbol, setSymbol] = useSelectedSymbol(list ?? null);
  const t = list?.tokens.find((x) => x.symbol === symbol) ?? null;
  const ticker = t?.ticker ?? symbol;
  return (
    <div className="grid">
      <section className="card" aria-labelledby="ap-how">
        <h2 id="ap-how">How it works</h2>
        <ol className="ap-steps">
          <li><b>You set the limits</b> in the Binance App: how much your Agentic Wallet may spend a day and which tokens it may trade. Bitstock can read them and can never change them.</li>
          <li><b>You ask your AI agent</b>, for example: “Buy $2 of {ticker} with Bitstock at the next market open.”</li>
          <li><b>Bitstock waits and checks.</b> At the open it reads the market, the token, the real stock&apos;s price, the price impact and a test run, and shows you every result.</li>
          <li><b>You say yes</b>, and your Agentic Wallet buys within your limits, at the price limit the checks allow.</li>
          <li><b>You see it</b> on BscScan and under Holdings, explained in shares.</li>
        </ol>
      </section>

      <section className="card" aria-labelledby="ap-now">
        <h2 id="ap-now">The next buy window</h2>
        <StockPicker tokens={list?.tokens ?? null} symbol={symbol} onPick={setSymbol} />
        {t ? <OpenWindow key={t.address} address={t.address} ticker={ticker} /> : null}
      </section>

      <section className="card" aria-labelledby="ap-setup">
        <h2 id="ap-setup">Set it up</h2>
        <p className="small">You need a Binance Agentic Wallet, created and signed in through the Binance App, and an AI agent that can use skills. Add {INSTALL.length > 1 ? "the two skills" : "the Binance Agentic Wallet skill"}:</p>
        {!REPO ? <p className="msg info">The Bitstock skill is not published yet, so there is nothing to install for it.</p> : null}
        {INSTALL.map((c) => <Copy key={c} text={c} />)}
        <p className="small">Then ask your agent:</p>
        <Copy text={`Buy $1 of ${ticker} with Bitstock now.`} />
        <Copy text={`Buy $2 of ${ticker} with Bitstock at the next market open.`} />
      </section>

      <section className="card" aria-labelledby="ap-never">
        <h2 id="ap-never">What it never does</h2>
        <ul className="list small">
          <li>Hold your keys or your money. Your Agentic Wallet signs, inside your own limits.</li>
          <li>Change your wallet&apos;s limits, or buy past them.</li>
          <li>Buy without your yes, or when a check fails.</li>
          <li>Swap a price-drop order for a market buy on its own.</li>
          <li>Trade for anyone who has not set it up in their own wallet.</li>
        </ul>
        <p className="small muted">Status: the skill is built and its checks run live; the first buy through a real Agentic Wallet has not been made yet.</p>
      </section>
    </div>
  );
}
