import type { Metadata } from "next";
import { CompanyNote, Quiz } from "@/components/Learn";

export const metadata: Metadata = { title: "Learn" };

const OUTCOMES = [
  { k: "Go", cls: "good", t: "Every check passed. The buy may go ahead with the normal price limit." },
  { k: "Go, with a tighter limit", cls: "warn", t: "Something calls for caution, such as the stock market being closed. The buy may go ahead, but the price may move only a little before the trade cancels itself." },
  { k: "Wait", cls: "idle", t: "Something could not be read. Bitstock buys nothing now and checks everything again later." },
  { k: "Do not buy now", cls: "bad", t: "A check failed, for example the issuer paused the token or the dry run did not show your tokens arriving. Nothing is bought." },
];

export default function LearnPage() {
  return (
    <>
      <p className="eyebrow">Learn</p>
      <h1>How your tokenized stock works</h1>
      <p className="lede">Plain words about what you hold and how Bitstock decides.</p>
      <div className="grid">
        <CompanyNote />
        <section className="card" aria-labelledby="out">
          <h2 id="out">What Bitstock&apos;s answers mean</h2>
          <ul className="list">
            {OUTCOMES.map((o) => (
              <li key={o.k}>
                <span><span className={`pill ${o.cls}`}>{o.k}</span><span className="small" ><br />{o.t}</span></span>
              </li>
            ))}
          </ul>
        </section>
        <Quiz />
      </div>
    </>
  );
}
