// Mode A: the server checks and prepares; the user signs in their own wallet. No key ever leaves the wallet.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var state = { account: null, config: null, decision: null };
  var eth = window.ethereum;

  function say(el, text, isError) { el.textContent = text; el.className = isError ? "error" : ""; }
  function hex(n) { return "0x" + BigInt(n).toString(16); }
  function fmt18(raw) { var s = BigInt(raw).toString().padStart(19, "0"); return s.slice(0, -18) + "." + s.slice(-18, -12); }

  function loadConfig() {
    return fetch("/v1/config").then(function (r) { return r.json(); }).then(function (c) {
      state.config = c;
      $("symbol").textContent = c.token.symbol;
      $("amount-help").textContent = "Up to $" + c.maxBuyUsd + " per buy." + (c.killSwitch ? " Bitstock is paused by its operator right now." : "");
    }).catch(function () { $("amount-help").textContent = "Settings are unavailable."; });
  }

  function connect() {
    if (!eth) { say($("wallet-status"), "No wallet found in this browser. Open this page inside your wallet's browser.", true); return; }
    say($("wallet-status"), "Connecting…");
    eth.request({ method: "eth_requestAccounts" }).then(function (accounts) {
      state.account = accounts[0];
      return eth.request({ method: "eth_chainId" });
    }).then(function (chainId) {
      if (chainId !== "0x38") return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
    }).then(function () {
      say($("wallet-status"), "Connected: " + state.account + " on BNB Smart Chain.");
      $("check").disabled = false;
    }).catch(function (e) { say($("wallet-status"), "Could not connect: " + (e && e.message ? e.message : e), true); });
  }

  function renderDecision(d) {
    state.decision = d;
    $("result").hidden = false;
    var o = $("outcome"); o.textContent = { GO: "Go", LIMIT: "Go, with a tighter limit", WAIT: "Wait", BLOCK: "Do not buy now" }[d.outcome] || d.outcome; o.className = "outcome " + d.outcome;
    $("reason").textContent = d.reason + (d.recheckAt ? " Bitstock will check again at " + d.recheckAt + "." : "");
    var list = $("checks"); list.textContent = "";
    (d.checks || []).forEach(function (c) {
      var li = document.createElement("li");
      var tag = document.createElement("span"); tag.className = "tag " + c.result; tag.textContent = c.result;
      li.appendChild(document.createTextNode(c.name + ": ")); li.appendChild(tag);
      li.appendChild(document.createTextNode(" " + c.reason));
      var src = document.createElement("span"); src.className = "src"; src.textContent = "Source: " + c.source + (c.asOf ? ", as of " + c.asOf : "");
      li.appendChild(src); list.appendChild(li);
    });
    var p = d.prepared;
    if (p && (d.outcome === "GO" || d.outcome === "LIMIT")) {
      $("prepared").hidden = false;
      $("prepared-summary").textContent = "Tested: you would receive about " + fmt18(p.simulation.stockArriving) + " " + state.config.token.symbol + ". If the price moves more than " + p.slippagePercent + "% before it lands, the swap cancels itself and you keep your USDT.";
      $("buy").disabled = false; say($("buy-status"), "");
    } else { $("prepared").hidden = true; }
  }

  function check() {
    var amount = $("amount").value.trim();
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(amount)) { say($("check-status"), "Enter a dollar amount such as 1 or 2.50.", true); return; }
    $("check").disabled = true; say($("check-status"), "Checking the market, the token, the price and a dry run…");
    fetch("/v1/decisions", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ token: state.config.token.address, amountUsd: amount, wallet: state.account }) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || ("HTTP " + r.status)); return b; }); })
      .then(function (d) { say($("check-status"), "Checked at " + d.at + "."); renderDecision(d); })
      .catch(function (e) { say($("check-status"), "The check failed: " + e.message, true); })
      .then(function () { $("check").disabled = false; });
  }

  function poll(id, tries) {
    fetch("/v1/decisions/" + id).then(function (r) { return r.json(); }).then(function (d) {
      if (d.status === "confirmed") say($("buy-status"), "Done. The swap is confirmed on BNB Smart Chain.");
      else if (d.status === "reverted") say($("buy-status"), "The swap was cancelled on chain (for example because the price moved past your limit). Your USDT was not spent; only the network fee was.", true);
      else if (tries > 0) setTimeout(function () { poll(id, tries - 1); }, 3000);
    });
  }

  function buy() {
    var d = state.decision, p = d && d.prepared;
    if (!p) return;
    if (Date.now() > p.expiresAt) { say($("buy-status"), "This check is too old. Press Check now again so Bitstock re-reads the market.", true); $("prepared").hidden = true; return; }
    if (state.account.toLowerCase() !== p.from.toLowerCase()) { say($("buy-status"), "The connected wallet is not the one this buy was prepared for.", true); return; }
    $("buy").disabled = true; say($("buy-status"), "Confirm the transaction in your wallet…");
    eth.request({ method: "eth_sendTransaction", params: [{ from: p.from, to: p.to, data: p.data, value: hex(p.value), gas: hex(p.gas), gasPrice: hex(p.gasPrice), chainId: "0x38" }] })
      .then(function (hash) {
        var a = document.createElement("a"); a.href = "https://bscscan.com/tx/" + hash; a.textContent = hash; a.target = "_blank"; a.rel = "noopener";
        $("buy-status").textContent = "Sent. Waiting for the network… "; $("buy-status").appendChild(a);
        return fetch("/v1/decisions/" + d.id + "/tx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash: hash }) }).then(function () { poll(d.id, 40); });
      })
      .catch(function (e) { say($("buy-status"), "Not sent: " + (e && e.message ? e.message : e), true); $("buy").disabled = false; });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadConfig();
    $("connect").addEventListener("click", connect);
    $("check").addEventListener("click", check);
    $("buy").addEventListener("click", buy);
  });
})();
