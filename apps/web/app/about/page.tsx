import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <p className="eyebrow">About</p>
      <h1>A careful way to buy small</h1>
      <p className="lede">Bitstock is a market-aware assistant for buying small amounts of tokenized stocks on BNB Smart Chain. It decides whether it is sensible to buy right now, helps you buy within your own limits, and explains what happens to what you own.</p>
      <div className="grid grid-2">
        <section className="card">
          <h2>What you can check yourself</h2>
          <ul className="list small">
            <li>It checks the market before every buy and shows the checks.</li>
            <li>It would rather wait or decline than buy at a bad time, and says why.</li>
            <li>It can only spend what you approve, and you sign every buy.</li>
            <li>Every buy is dry-run first, and every transaction is public on BscScan.</li>
          </ul>
        </section>
        <section className="card">
          <h2>What it does not do</h2>
          <ul className="list small">
            <li>It does not promise profit or protect you from loss.</li>
            <li>It does not hold your keys or your money.</li>
            <li>It does not trade for anyone who has not set it up.</li>
            <li>It is not investment advice. Tokenized stocks can be paused or blocked by their issuer.</li>
          </ul>
        </section>
        <section className="card">
          <h2>What is built today</h2>
          <ul className="list small">
            <li><span>Protected buy, signed in your own wallet</span><span className="pill good">Live</span></li>
            <li><span>Holdings in shares, explained</span><span className="pill good">Live</span></li>
            <li><span>Scheduled buys through your own Binance Agentic Wallet</span><span className="pill idle">Not built yet</span></li>
            <li><span>Free first slice</span><span className="pill idle">Not built yet</span></li>
          </ul>
        </section>
        <section className="card">
          <h2>How it decides</h2>
          <p className="small">Five checks on live data: the market session, the token&apos;s share multiplier, an independent stock price, the price impact of your exact trade, and a dry run that must show your tokens arriving. The rules are fixed and written down; no AI model decides whether, what or how much to buy.</p>
          <p className="small"><a href="https://github.com/Datwebguy/bitstock" target="_blank" rel="noopener noreferrer">Source code, method and evidence</a></p>
        </section>
      </div>
    </>
  );
}
