"use client";
import { useEffect, useRef, useState } from "react";
import { RESTRICTED_PLACES } from "@/lib/regions";

/** Bump when the wording people agree to changes, so everyone is asked again. */
const VERSION = "1";
const KEY = "bitstock-region-confirmed";

/**
 * The first-visit confirmation: the visitor says they are not in a restricted place before using
 * Bitstock. It sits on top of the server-side block on the claim pages, which still refuses
 * requests from those places whatever is clicked here.
 */
export function RegionGate() {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<"checking" | "ask" | "ok" | "declined">("checking");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let next: "ask" | "ok" | "declined" = "ask";
    try {
      if (localStorage.getItem(KEY) === VERSION) next = "ok";
      else if (sessionStorage.getItem(KEY) === "declined") next = "declined";
    } catch {
      /* storage unavailable: ask every visit */
    }
    setState(next);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if ((state === "ask" || state === "declined") && !d.open) d.showModal();
    if (state === "ok" && d.open) d.close();
  }, [state]);

  const confirm = () => {
    try {
      localStorage.setItem(KEY, VERSION);
    } catch {
      /* ignore */
    }
    setState("ok");
  };
  const decline = () => {
    try {
      sessionStorage.setItem(KEY, "declined");
    } catch {
      /* ignore */
    }
    setState("declined");
  };

  if (state === "checking" || state === "ok") return null;
  return (
    <dialog ref={ref} className="gate" aria-labelledby="gate-title" aria-describedby="gate-desc" onCancel={(e) => e.preventDefault()}>
      {state === "ask" ? (
        <div className="gate-in">
          <h2 id="gate-title">Before you continue</h2>
          <p id="gate-desc" className="small">Bitstock is not available to people who live in, or are located in:</p>
          <ul className="gate-places small">{RESTRICTED_PLACES.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="small muted">Tokenized stocks can lose value, and the company that issues them can pause or block them. Bitstock is not investment advice.</p>
          <label className="gate-check small">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I confirm I do not live in and am not located in any of these places, and I understand Bitstock is not investment advice.</span>
          </label>
          <button type="button" className="btn btn-primary" disabled={!agreed} onClick={confirm}>Continue</button>
          <button type="button" className="btn btn-ghost" onClick={decline}>I am in one of these places</button>
        </div>
      ) : (
        <div className="gate-in">
          <h2 id="gate-title">Bitstock is not available where you are</h2>
          <p id="gate-desc" className="small">We are sorry. Because of legal limits, Bitstock cannot be used from your country or region. Nothing about your visit was recorded.</p>
        </div>
      )}
    </dialog>
  );
}
