import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CachedTranslator, keepsFacts, protectedParts } from "../src/translate.ts";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "tr-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("translation checker", () => {
  it("finds the numbers, tickers, addresses and names a translation must keep", () => {
    const p = protectedParts("Buy $1 of NVDA on BNB Smart Chain: 1.000778 shares, 0xEf4d…a163, +0.49%");
    for (const x of ["1", "1.000778", "NVDA", "BNB Smart Chain", "0xEf4d…a163", "0.49"]) expect(p).toContain(x);
  });
  it("accepts a translation that keeps every fact and rejects one that changes or drops a number", () => {
    expect(keepsFacts("Up to $5 per buy.", "Hasta $5 por compra.")).toBe(true);
    expect(keepsFacts("Up to $5 per buy.", "Hasta $50 por compra.")).toBe(false);
    expect(keepsFacts("Each token stands for 1.000778 shares.", "Cada token representa 1,000778 acciones.")).toBe(false);
    expect(keepsFacts("Pay with USDT.", "Paga con dólares.")).toBe(false);
    expect(keepsFacts("Anything", "")).toBe(false);
  });
});

describe("cached translator", () => {
  it("returns English unchanged when no translation service is configured", async () => {
    const t = new CachedTranslator(dir(), null);
    expect(t.enabled).toBe(false);
    expect(await t.translate("es", ["Connect wallet"])).toEqual(["Connect wallet"]);
  });
  it("translates once, caches, and keeps English where a fact was changed", async () => {
    let calls = 0;
    const t = new CachedTranslator(dir(), async () => { calls++; return JSON.stringify({ t: ["Conectar billetera", "Hasta $9 por compra."] }); });
    const first = await t.translate("es", ["Connect wallet", "Up to $5 per buy."]);
    expect(first).toEqual(["Conectar billetera", "Up to $5 per buy."]);
    const again = await t.translate("es", ["Connect wallet"]);
    expect(again).toEqual(["Conectar billetera"]);
    expect(calls).toBe(1);
  });
  it("keeps English when the service fails or answers nonsense", async () => {
    const down = new CachedTranslator(dir(), async () => { throw new Error("down"); });
    expect(await down.translate("tr", ["Check"])).toEqual(["Check"]);
    const junk = new CachedTranslator(dir(), async () => "not json");
    expect(await junk.translate("vi", ["Check"])).toEqual(["Check"]);
  });
});
