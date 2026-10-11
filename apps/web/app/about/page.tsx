import { SplitReveal } from "@/components/Motion";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <p className="eyebrow">About</p>
      <SplitReveal as="h1" text="A careful way to buy small" />
      <p className="lede">Bitstock helps you buy small amounts of tokenized stocks on BNB Smart Chain. It checks whether it is sensible to buy right now, helps you buy within your own limits, and explains what happens to what you own.</p>
      <div className="grid grid-2">
        <section className="card">
          <h2>What you can check yourself</h2>
          <ul className="list small">
            <li>It checks the market before every buy and shows the checks.</li>
            <li>It would rather wait or decline than buy at a bad time, and says why.</li>
            <li>It can only spend what you approve, and you sign every buy.</li>
            <li>Every buy is tested before you sign, and every buy is public on BscScan.</li>
          </ul>
        </section>
        <section className="card">
          <h2>What it does not do</h2>
          <ul className="list small">
            <li>It does not promise profit or protect you from loss.</li>
            <li>It does not hold your keys or your money.</li>
            <li>It does not trade for anyone who has not set it up.</li>
            <li>It is not investment advice. Tokenized stocks can be paused or blocked by the company that issues them.</li>
          </ul>
        </section>
        <section className="card">
          <h2>What is built today</h2>
          <ul className="list small">
            <li><span>Checks and protected buys for every tokenized stock Binance lists</span><span className="pill good">Live</span></li>
            <li><span>Holdings in shares, explained</span><span className="pill good">Live</span></li>
            <li><span>Checked buys and buys at the market open through your own Binance Agentic Wallet, as a wallet skill</span><span className="pill warn">Built, first live run pending</span></li>
            <li><span>A free first slice, with the network fee paid for you</span><span className="pill warn">Built, opens when funded</span></li>
          </ul>
        </section>
        <section className="card">
          <h2>How it decides</h2>
          <p className="small">Five checks on live data: whether the stock market is open, how many shares one token stands for, the real stock&apos;s price from a separate source, how much your exact amount moves the price, and a test run that must show your tokens arriving. The rules are fixed and written down; no AI model decides whether, what or how much to buy.</p>
          <p className="small"><a href="https://github.com/Datwebguy/bitstock" target="_blank" rel="noopener noreferrer">How it is built, and the proof</a></p>
        </section>
      </div>
    </>
  );
}
