"use client";
import { useEffect, useState } from "react";
import { api, units18, when, type Decision } from "@/lib/api";
import { short, useWallet } from "@/lib/wallet";

const TITLES: Record<Decision["outcome"], string> = { GO: "Go", LIMIT: "Go, with a tighter limit", WAIT: "Wait", BLOCK: "Do not buy now" };
const BADGE: Record<Decision["outcome"], string> = { GO: "✓", LIMIT: "!", WAIT: "…", BLOCK: "×" };
const DOT: Record<string, string> = { pass: "✓", warn: "!", unavailable: "?", fail: "×" };

function feeBnb(gas: string, gasPrice: string): string {
  const wei = BigInt(gas) * BigInt(gasPrice);
  const s = wei.toString().padStart(19, "0");
  return `${s.slice(0, -18)}.${s.slice(-18, -10)}`;
}

export function BuyFlow({ nvdab, maxUsd }: { nvdab: string; maxUsd: string }) {
  const w = useWallet();
  const [amount, setAmount] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [d, setD] = useState<Decision | null>(null);
  const [phase, setPhase] = useState<"idle" | "signing" | "sent" | "confirmed" | "reverted" | "failed">("idle");
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const check = async () => {
    if (!w.account) return;
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      setCheckErr("Enter a dollar amount such as 1 or 2.50.");
      return;
    }
    setChecking(true);
    setCheckErr(null);
    setD(null);
    setPhase("idle");
    setHash(null);
    setBuyMsg(null);
    try {
      const r = await api<Decision>("/decisions", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ token: nvdab, amountUsd: amount, wallet: w.account }) });
      setD(r);
    } catch (e) {
      setCheckErr(e instanceof Error ? e.message : "The check failed.");
    } finally {
      setChecking(false);
    }
  };

  const poll = async (id: string, tries: number) => {
    try {
      const r = await api<Decision>(`/decisions/${id}`);
      if (r.status === "confirmed") return setPhase("confirmed");
      if (r.status === "reverted") return setPhase("reverted");
    } catch {
      /* keep polling */
    }
    if (tries > 0) setTimeout(() => void poll(id, tries - 1), 3000);
  };

  const buy = async () => {
    const p = d?.prepared;
    if (!d || !p || !w.account) return;
    if (Date.now() > p.expiresAt) {
      setBuyMsg("This check is more than 90 seconds old. Check again so Bitstock re-reads the market.");
      return;
    }
    if (w.account.toLowerCase() !== p.from.toLowerCase()) {
      setBuyMsg("The connected wallet is not the one this buy was prepared for.");
      return;
    }
    setPhase("signing");
    setBuyMsg(null);
    try {
      const h = await w.send({ from: p.from, to: p.to, data: p.data, value: "0x" + BigInt(p.value).toString(16), gas: "0x" + BigInt(p.gas).toString(16), gasPrice: "0x" + BigInt(p.gasPrice).toString(16) });
      setHash(h);
      setPhase("sent");
      await api(`/decisions/${d.id}/tx`, { method: "POST", body: JSON.stringify({ txHash: h }) }).catch(() => undefined);
      void poll(d.id, 60);
    } catch (e) {
      setPhase("failed");
      setBuyMsg(e instanceof Error ? e.message : "The wallet did not send the transaction.");
    }
  };

  const p = d?.prepared;
  const left = p ? Math.max(0, Math.round((p.expiresAt - now) / 1000)) : 0;
  const canBuy = d && p && (d.outcome === "GO" || d.outcome === "LIMIT") && left > 0 && (phase === "idle" || phase === "failed");

  return (
    <div className="grid">
      <section className="card" aria-labelledby="s1">
        <h2 id="s1">1 · Your wallet</h2>
        {w.account ? (
          <p className="small">Connected <span className="mono">{short(w.account)}</span>{w.onBsc ? " on BNB Smart Chain." : ". Switch to BNB Smart Chain in your wallet."}</p>
        ) : (
          <>
            <p className="small muted">Bitstock never holds your keys. You sign every buy yourself.</p>
            <button className="btn btn-primary" type="button" onClick={() => void w.connect()} disabled={w.connecting}>{w.connecting ? "Connecting…" : "Connect wallet"}</button>
          </>
        )}
        {w.error ? <p className="msg error" role="alert">{w.error}</p> : null}
      </section>

      <section className="card" aria-labelledby="s2">
        <h2 id="s2">2 · How much NVDAB?</h2>
        <label className="field" htmlFor="amt">Amount in US dollars, paid in USDT</label>
        <div className="amount">
          <span aria-hidden="true">$</span>
          <input id="amt" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} aria-describedby="amt-help" />
        </div>
        <div className="chips" role="group" aria-label="Quick amounts">
          {["1", "2", maxUsd].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={amount === v} onClick={() => setAmount(v)}>${v}</button>
          ))}
        </div>
        <p id="amt-help" className="small muted">Up to ${maxUsd} per buy.</p>
        <button className="btn btn-primary" type="button" onClick={() => void check()} disabled={!w.account || checking}>{checking ? "Checking market, token, price and a dry run…" : "Check this buy"}</button>
        {checkErr ? <p className="msg error" role="alert">{checkErr}</p> : null}
      </section>

      {d ? (
        <section className="card" aria-labelledby="s3" aria-live="polite">
          <h2 id="s3">3 · What Bitstock found</h2>
          <div className={`outcome ${d.outcome}`}>
            <span className="badge" aria-hidden="true">{BADGE[d.outcome]}</span>
            <div>
              <p className="outcome-title">{TITLES[d.outcome]}</p>
              <p className="small">{d.reason}{d.recheckAt ? ` Bitstock will check again ${when(d.recheckAt)}.` : ""}</p>
            </div>
          </div>
          <ol className="checks">
            {d.checks.map((c) => (
              <li key={c.id}>
                <span className={`check-dot ${c.result}`} aria-hidden="true">{DOT[c.result]}</span>
                <span className="check-name">{c.name}</span>
                <span className={`check-result ${c.result}`}>{c.result}</span>
                <div className="small">{c.reason}</div>
                <span className="source">Source: {c.source}{c.asOf ? `, as of ${when(c.asOf)}` : ""}</span>
              </li>
            ))}
          </ol>
          <p className="source">Decision {d.id} · rules version {d.rulesVersion} · {when(d.at)}</p>

          {p && (d.outcome === "GO" || d.outcome === "LIMIT") ? (
            <>
              <hr className="divider" />
              <h3>Tested before you sign</h3>
              <dl className="kv small">
                <dt>You receive about</dt><dd className="num">{units18(p.simulation.stockArriving) ?? "unavailable"} NVDAB</dd>
                <dt>Guaranteed at least</dt><dd className="num">{units18(p.minReceiveAmount) ?? "unavailable"} NVDAB</dd>
                <dt>Price may move at most</dt><dd className="num">{p.slippagePercent}%</dd>
                <dt>Network fee at most</dt><dd className="num">{feeBnb(p.gas, p.gasPrice)} BNB</dd>
                <dt>Valid for</dt><dd className="num">{left > 0 ? `${left} s` : "expired"}</dd>
              </dl>
              <p className="small muted">If the price moves past the limit before the trade lands, the swap cancels itself on chain and you keep your USDT.</p>
              <div className="steps" aria-label="Progress">
                <div className={`step ${phase === "signing" ? "on" : phase !== "idle" && phase !== "failed" ? "done" : ""}`}>Confirm in wallet</div>
                <div className={`step ${phase === "sent" ? "on" : phase === "confirmed" || phase === "reverted" ? "done" : ""}`}>On its way</div>
                <div className={`step ${phase === "confirmed" ? "done" : ""}`}>Confirmed</div>
              </div>
              {left > 0 ? (
                <button className="btn btn-primary" type="button" onClick={() => void buy()} disabled={!canBuy}>{phase === "signing" ? "Confirm in your wallet…" : `Buy $${amount} of NVDAB`}</button>
              ) : (
                <button className="btn btn-ghost" type="button" onClick={() => void check()}>Check again</button>
              )}
              {hash ? <p className="msg info">Transaction: <a className="mono" href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noopener noreferrer">{hash}</a></p> : null}
              {phase === "confirmed" ? <p className="msg ok" role="status">Done. Your NVDAB has arrived. See it under Holdings.</p> : null}
              {phase === "reverted" ? <p className="msg error" role="alert">The swap was cancelled on chain, for example because the price moved past your limit. Your USDT was not spent; only the network fee was.</p> : null}
              {buyMsg ? <p className="msg error" role="alert">{buyMsg}</p> : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
