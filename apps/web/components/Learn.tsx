"use client";
import { useEffect, useState } from "react";
import { api, trimDecimal, when, type MarketView } from "@/lib/api";

interface QuizItem { question: string; options: string[]; answer: number; explanation?: string }

export function CompanyNote() {
  const [m, setM] = useState<MarketView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<MarketView>("/market").then(setM).catch((e: Error) => setErr(e.message));
  }, []);
  const mult = m?.multiplier.value ? trimDecimal(m.multiplier.value.current, 6) : null;
  return (
    <div className="grid grid-2">
      <section className="card" aria-labelledby="co">
        <h2 id="co">The company</h2>
        <p className="small">{m ? m.company.note ?? "unavailable" : err ? `unavailable: ${err}` : <span className="skeleton" />}</p>
        {m ? <span className="source">Source: {m.company.source}, as of {when(m.company.asOf)}</span> : null}
      </section>
      <section className="card" aria-labelledby="tok">
        <h2 id="tok">What one token means</h2>
        <p className="small">Each NVDAB token stands for <b className="num">{mult ?? "an unavailable number of"}</b> shares of NVIDIA. When a dividend is reinvested, that number rises and the share price drops by the dividend on the ex-dividend date, so the token&apos;s price stays roughly the same. Your token then represents more shares; your holdings did not suddenly grow.</p>
        {m ? <span className="source">Source: {m.multiplier.source}, as of {when(m.multiplier.asOf)}</span> : null}
      </section>
    </div>
  );
}

export function Quiz() {
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});
  useEffect(() => {
    fetch("/quiz.json")
      .then((r) => r.json() as Promise<unknown>)
      .then((v) => setItems(Array.isArray(v) ? (v as QuizItem[]).filter((q) => q && typeof q.question === "string" && Array.isArray(q.options) && Number.isInteger(q.answer)) : []))
      .catch(() => setItems([]));
  }, []);
  if (items === null) return null;
  if (items.length === 0) return <section className="card"><h2>Quiz</h2><p className="small muted">The quiz is not published yet.</p></section>;
  return (
    <section className="card" aria-labelledby="quiz">
      <h2 id="quiz">Quiz</h2>
      <ol className="checks">
        {items.map((q, i) => (
          <li key={i}>
            <span className={`check-dot ${picked[i] === undefined ? "unavailable" : picked[i] === q.answer ? "pass" : "fail"}`} aria-hidden="true">{i + 1}</span>
            <fieldset className="card" >
              <legend className="check-name">{q.question}</legend>
              <div className="chips">
                {q.options.map((o, j) => (
                  <button key={j} type="button" className="chip" aria-pressed={picked[i] === j} onClick={() => setPicked({ ...picked, [i]: j })}>{o}</button>
                ))}
              </div>
              {picked[i] !== undefined ? <p className={`msg ${picked[i] === q.answer ? "ok" : "error"}`} role="status">{picked[i] === q.answer ? "Correct." : "Not quite."} {q.explanation ?? ""}</p> : null}
            </fieldset>
          </li>
        ))}
      </ol>
    </section>
  );
}
