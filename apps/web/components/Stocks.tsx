"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, sessionWord, trimDecimal, type ListedToken, type TokenList } from "@/lib/api";

/** The live list of tokenized stocks, refreshed every minute. */
export function useTokens(): { list: TokenList | null; err: string | null } {
  const [list, setList] = useState<TokenList | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<TokenList>("/tokens")
        .then((v) => alive && (setList(v), setErr(null)))
        .catch((e: Error) => alive && setErr(e.message));
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { list, err };
}

const DEFAULT = "NVDAB";

/** The stock chosen in the address bar (?s=SYMBOL), so a link always opens the same stock. */
export function useSelectedSymbol(): [string, (symbol: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const fromUrl = params.get("s");
  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => {
    try {
      setRemembered(localStorage.getItem("stock"));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const symbol = (fromUrl || remembered || DEFAULT).toUpperCase();
  const set = (s: string) => {
    try {
      localStorage.setItem("stock", s);
    } catch {
      /* ignore */
    }
    setRemembered(s);
    router.replace(`${path}?s=${encodeURIComponent(s)}`, { scroll: false });
  };
  return [symbol, set];
}

/**
 * The company's own logo, looked up by its stock ticker; Binance's bStock logo if that fails, then
 * the first letter. Tokens on BNB Smart Chain carry Binance's framed logo, so the company mark comes
 * from a public logo service keyed by ticker.
 */
export function StockLogo({ t, size = 40 }: { t: Pick<ListedToken, "logo" | "symbol"> & { ticker?: string | null } | null; size?: number }) {
  const sources = [t?.ticker ? `https://financialmodelingprep.com/image-stock/${encodeURIComponent(t.ticker)}.png` : null, t?.logo ?? null].filter((v): v is string => Boolean(v));
  const [i, setI] = useState(0);
  const key = sources.join("|");
  useEffect(() => setI(0), [key]);
  if (i < sources.length) return <img className="stock-logo" src={sources[i]} alt="" width={size} height={size} loading="lazy" onError={() => setI((n) => n + 1)} />;
  return <span className={`stock-logo fallback s${size}`} aria-hidden="true">{(t?.ticker ?? t?.symbol ?? "?").slice(0, 1)}</span>;
}

function Row({ t, onPick, current }: { t: ListedToken; onPick: (s: string) => void; current: boolean }) {
  const s = sessionWord(t.session);
  return (
    <li>
      <button type="button" className={`stock-row${current ? " on" : ""}`} onClick={() => onPick(t.symbol)} aria-current={current ? "true" : undefined}>
        <StockLogo t={t} size={36} />
        <span className="stock-id">
          <b>{t.ticker ?? t.symbol}</b>
          <span className="muted small">{t.company ?? t.name ?? t.symbol}</span>
        </span>
        <span className="stock-px">
          <span className="num">{t.price ? `$${trimDecimal(t.price, 2)}` : "unavailable"}</span>
          <span className={`dot-label ${s.cls}`}>{s.text}</span>
        </span>
      </button>
    </li>
  );
}

/** A searchable list of every tokenized stock Binance lists right now. */
export function StockList({ tokens, current, onPick, limit }: { tokens: ListedToken[]; current?: string; onPick: (s: string) => void; limit?: number }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const f = k ? tokens.filter((t) => [t.symbol, t.ticker, t.company, t.name].some((v) => v?.toLowerCase().includes(k))) : tokens;
    return limit ? f.slice(0, limit) : f;
  }, [q, tokens, limit]);
  return (
    <div className="stock-list">
      <label className="sr-only" htmlFor="stock-q">Search stocks</label>
      <input id="stock-q" className="search" type="search" placeholder={`Search ${tokens.length} stocks: name or ticker`} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {shown.length === 0 ? <p className="small muted">No stock matches “{q}”.</p> : null}
      <ul className="stock-rows">
        {shown.map((t) => (
          <Row key={t.address} t={t} onPick={onPick} current={t.symbol === current} />
        ))}
      </ul>
    </div>
  );
}

/** The current stock as a button; tapping it opens the full list in a sheet. */
export function StockPicker({ tokens, symbol, onPick }: { tokens: ListedToken[] | null; symbol: string; onPick: (s: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = tokens?.find((x) => x.symbol === symbol) ?? null;
  const pick = (s: string) => {
    onPick(s);
    ref.current?.close();
  };
  return (
    <>
      <button type="button" className="picker" onClick={() => ref.current?.showModal()} disabled={!tokens} aria-haspopup="dialog">
        <StockLogo t={t ?? { logo: null, symbol, ticker: null }} size={36} />
        <span className="stock-id">
          <b>{t?.ticker ?? symbol}</b>
          <span className="muted small">{t ? (t.company ?? t.name ?? symbol) : tokens ? "Not listed right now" : "Loading stocks…"}</span>
        </span>
        <span className="picker-cta">Change</span>
      </button>
      <dialog ref={ref} className="sheet" aria-labelledby="pick-title" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <div className="sheet-in">
          <div className="sheet-head">
            <h2 id="pick-title">Choose a stock</h2>
            <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="Close">×</button>
          </div>
          {tokens ? <StockList tokens={tokens} current={symbol} onPick={pick} /> : null}
        </div>
      </dialog>
    </>
  );
}
