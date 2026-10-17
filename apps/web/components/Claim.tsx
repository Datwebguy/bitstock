"use client";
import { useEffect, useState } from "react";
import { api, units18, when } from "@/lib/api";
import { short, useWallet, walletMessage } from "@/lib/wallet";
import { DisconnectButton } from "./DisconnectButton";
import { StockLogo, useTokens } from "./Stocks";

interface GiftClaim { box: number; amount: string; status: string; txHash: string | null; gasUsed: string | null; feeWei: string | null; at: string; wallet: string }
interface GiftStatus {
  open: boolean; configured: boolean; fundedUsd?: string | null; boxesUsd?: string[] | null; token: string; received?: string; boxes?: string[]; remaining?: number; commitment?: string; expiresAt?: string;
  fundTx?: string | null; claims?: GiftClaim[]; reveal?: { assignment: string; secret: string; check: string };
}

const bnb = (wei: string | null) => (wei ? units18(wei, 8) : null);
const CLAIM_STATUS: Record<string, string> = { confirmed: "Delivered", sending: "On its way", reverted: "Refused by the network; box free again", dropped: "Dropped by the network; box free again", failed: "Not sent" };

export function ClaimView({ region }: { region: string | null }) {
  const w = useWallet();
  const { list } = useTokens();
  const [g, setG] = useState<GiftStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [mine, setMine] = useState<GiftClaim | null>(null);

  const [checking, setChecking] = useState(false);

  const load = () => api<GiftStatus>("/gift").then((v) => (setG(v), setErr(null))).catch((e: Error) => setErr(e.message));
  // The boxes left change as other people claim, so the page re-reads them while it is open.
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => clearInterval(t);
  }, []);

  // Ask the server whether this wallet already has its slice, so that is known after a refresh or a reconnect too.
  useEffect(() => {
    setMine(null); setMsg(null); setPhase("idle");
    if (!w.account) { setChecking(false); return; }
    let alive = true;
    setChecking(true);
    api<{ claim: GiftClaim | null }>(`/gift/claim?wallet=${w.account}`)
      .then((r) => { if (alive && r.claim) { setMine(r.claim); setPhase(r.claim.status === "confirmed" ? "done" : "failed"); } })
      .catch(() => undefined)
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [w.account]);

  const token = list?.tokens.find((t) => t.address === g?.token) ?? null;
  const symbol = token?.symbol ?? "the stock";

  const claim = async () => {
    if (!w.account) return;
    setPhase("working");
    setMsg(null);
    try {
      const res = await fetch("/api/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: w.account }) });
      const out = (await res.json().catch(() => ({}))) as GiftClaim & { error?: string; already?: boolean; retry?: boolean };
      if (!res.ok) throw new Error(out.error ?? "The claim did not go through.");
      if (out.retry) {
        // The network refused the transfer, so nothing was sent and the box is free again. Bitstock paid the fee.
        setPhase("failed");
        setMsg("The network refused this transfer, so nothing was sent and your wallet can try again. If it is refused again, the stock's issuer may not allow this wallet to receive it.");
        void load();
        return;
      }
      setMine(out);
      setPhase(out.status === "confirmed" ? "done" : "failed");
      void load();
    } catch (e) {
      setPhase("failed");
      setMsg(e instanceof Error ? e.message : walletMessage(e, "The claim did not go through."));
    }
  };

  if (!g) return err ? <p className="msg error" role="alert">The gift's status is unavailable right now. {err}</p> : <div className="card" aria-busy="true"><span className="skeleton" /></div>;

  if (!g.open) {
    return (
      <section className="card">
        <h2>The free first slice is not open right now</h2>
        <p className="small">When it opens, a person with no BNB can receive a small amount of a tokenized stock as a gift, with the network fee paid for them. Nothing on this page pretends otherwise.</p>
        {g.reveal ? <Reveal g={g} /> : null}
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="card card-hero" aria-labelledby="gift">
        <div className="token">
          <StockLogo t={token ?? { logo: null, symbol: "?", ticker: null }} size={44} />
          <div>
            <h2 id="gift" className="check-name">A free slice of {token?.company ?? symbol}</h2>
            <div className="muted small">{g.remaining} of {g.boxes?.length} boxes left · open until {when(g.expiresAt)}</div>
          </div>
        </div>
        <p className="small">Connect any BNB Smart Chain wallet, even one with no BNB. Bitstock pays the network fee and sends your box straight to your wallet. One claim per wallet. You pay nothing.</p>
        {region === "unknown" ? <p className="msg info">Your region could not be confirmed, so a claim cannot be made from here.</p> : null}
        {!w.account ? (
          <button className="btn btn-primary" type="button" onClick={() => void w.connect()} disabled={w.connecting}>{w.connecting ? "Connecting…" : "Connect wallet"}</button>
        ) : (
          <>
            <p className="small">Wallet <span className="mono">{short(w.account)}</span></p>
            <DisconnectButton />
            <button className="btn btn-primary" type="button" onClick={() => void claim()} disabled={phase === "working" || phase === "done" || checking || Boolean(mine) || region === "unknown" || g.remaining === 0}>
              {phase === "working" ? "Testing and sending your slice…" : mine ? "Already claimed" : checking ? "Checking this wallet…" : `Claim my free ${symbol}`}
            </button>
          </>
        )}
        {w.error ? <p className="msg error" role="alert">{w.error}</p> : null}
        {mine && mine.status === "confirmed" ? (
          <p className="msg ok" role="status">This wallet has its slice: Box {mine.box} sent {units18(mine.amount, 8)} {symbol}. Each wallet can claim once. <a href={`https://bscscan.com/tx/${mine.txHash}`} target="_blank" rel="noopener noreferrer">See it on BscScan</a>.</p>
        ) : mine ? (
          <p className="msg info" role="status">This wallet has already claimed Box {mine.box}. {CLAIM_STATUS[mine.status] ?? "Unavailable"}. Each wallet can claim once.{mine.txHash ? <> <a href={`https://bscscan.com/tx/${mine.txHash}`} target="_blank" rel="noopener noreferrer">See it on BscScan</a>.</> : null}</p>
        ) : null}
        {msg ? <p className={`msg ${phase === "failed" ? "error" : "info"}`} role="alert">{msg}</p> : null}
      </section>

      <section className="card" aria-labelledby="boxes">
        <h2 id="boxes">The boxes</h2>
        <p className="small">The gift is {g.fundedUsd ? `$${g.fundedUsd}` : "a small amount"} of {symbol}, split into ten boxes of different sizes. You receive the stock token itself, not dollars. The order claims take them was fixed and committed before the gift opened, and is revealed after it closes.</p>
        <ul className="list small">
          {g.boxes?.map((b, i) => <li key={i}><span>{g.boxesUsd?.[i] ? `About $${g.boxesUsd[i]} worth` : `Box ${i + 1}`}</span><span className="num">{units18(b, 8)} {symbol}</span></li>)}
        </ul>
        <span className="source">Commitment: <span className="mono">{g.commitment}</span></span>
        {g.fundTx ? <span className="source">Bought with <a href={`https://bscscan.com/tx/${g.fundTx}`} target="_blank" rel="noopener noreferrer">this swap</a>.</span> : null}
      </section>

      {g.claims && g.claims.length ? (
        <section className="card" aria-labelledby="claims">
          <h2 id="claims">Claims so far</h2>
          <ul className="list small">
            {g.claims.map((c) => (
              <li key={`${c.box}-${c.at}`}>
                <span>Box {c.box} · {units18(c.amount, 8)} {symbol} to {c.wallet}<span className="source">{c.status === "confirmed" ? `Network fee paid by Bitstock: ${bnb(c.feeWei)} BNB` : (CLAIM_STATUS[c.status] ?? "Unavailable")}</span></span>
                {c.txHash ? <a href={`https://bscscan.com/tx/${c.txHash}`} target="_blank" rel="noopener noreferrer">BscScan</a> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Reveal({ g }: { g: GiftStatus }) {
  return (
    <>
      <h3>The draw, revealed</h3>
      <p className="small">You can check this yourself. Before the gift opened, Bitstock published a fingerprint of the order and a secret together (the commitment). Hash the order followed by the secret with SHA-256 and you get the same fingerprint, which shows nothing was changed afterwards.</p>
      <span className="source">Commitment: <span className="mono">{g.commitment}</span></span>
      <span className="source">Order: <span className="mono">{g.reveal?.assignment}</span></span>
      <span className="source">Secret: <span className="mono">{g.reveal?.secret}</span></span>
    </>
  );
}
