import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CachedTranslator, keepsFacts, protectedParts } from "../src/translate.ts";

const dirs: string[] = [];
const opened: CachedTranslator[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "tr-")); dirs.push(d); return d; };
const make = (...args: ConstructorParameters<typeof CachedTranslator>) => { const t = new CachedTranslator(...args); opened.push(t); return t; };
afterEach(() => {
  while (opened.length) opened.pop()!.dispose();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

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
  it("rejects a translation that adds a number the source does not have", () => {
    expect(keepsFacts("Check this buy.", "Revisa esta compra de 5 dólares.")).toBe(false);
    expect(keepsFacts("Up to $5 per buy.", "Hasta $5 por compra, 2 veces.")).toBe(false);
    expect(keepsFacts("Up to $5 per buy, 5 times.", "Hasta $5 por compra, 5 veces.")).toBe(true);
  });
});

describe("cached translator", () => {
  it("returns English unchanged when no translation service is configured", async () => {
    const t = make(dir(), null);
    expect(t.enabled).toBe(false);
    expect(await t.translate("es", ["Connect wallet"])).toEqual(["Connect wallet"]);
  });
  it("translates once, caches, and keeps English where a fact was changed", async () => {
    let calls = 0;
    const t = make(dir(), async () => { calls++; return JSON.stringify({ t: ["Conectar billetera", "Hasta $9 por compra."] }); });
    const first = await t.translate("es", ["Connect wallet", "Up to $5 per buy."]);
    expect(first).toEqual(["Conectar billetera", "Up to $5 per buy."]);
    const again = await t.translate("es", ["Connect wallet"]);
    expect(again).toEqual(["Conectar billetera"]);
    expect(calls).toBe(1);
    // the refused sentence is on record too, so it is not sent to the model again
    expect(await t.translate("es", ["Up to $5 per buy."])).toEqual(["Up to $5 per buy."]);
    expect(calls).toBe(1);
  });
  it("keeps English when the service fails or answers nonsense", async () => {
    const down = make(dir(), async () => { throw new Error("down"); });
    expect(await down.translate("tr", ["Check"])).toEqual(["Check"]);
    const junk = make(dir(), async () => "not json");
    expect(await junk.translate("vi", ["Check"])).toEqual(["Check"]);
  });
  it("stops calling the model once the day's budget is spent, and resumes the next day", async () => {
    let calls = 0;
    let now = new Date("2026-10-17T10:00:00.000Z");
    const echo = async (_s: string, user: string) => { calls++; return JSON.stringify({ t: (JSON.parse(user) as string[]).map((x) => `es:${x}`) }); };
    const t = make(dir(), echo, { maxRows: 100, maxCallsPerDay: 2 }, () => now);
    await t.translate("es", ["a"]);
    await t.translate("es", ["b"]);
    expect(await t.translate("es", ["c"])).toEqual(["c"]);
    expect(calls).toBe(2);
    now = new Date("2026-10-18T00:00:01.000Z");
    expect(await t.translate("es", ["c"])).toEqual(["es:c"]);
    expect(calls).toBe(3);
  });
  it("keeps at most the configured number of sentences, dropping the oldest", async () => {
    let tick = 0;
    const echo = async (_s: string, user: string) => JSON.stringify({ t: (JSON.parse(user) as string[]).map((x) => `es:${x}`) });
    const d = dir();
    const t = make(d, echo, { maxRows: 2, maxCallsPerDay: 100 }, () => new Date(Date.UTC(2026, 9, 17, 0, 0, tick++)));
    await t.translate("es", ["one"]);
    await t.translate("es", ["two"]);
    await t.translate("es", ["three"]);
    let calls = 0;
    const probe = make(d, async () => { calls++; return JSON.stringify({ t: ["again"] }); }, { maxRows: 2, maxCallsPerDay: 100 });
    // "two" and "three" are still on record; "one" was dropped and is asked for again.
    expect(await probe.translate("es", ["two", "three"])).toEqual(["es:two", "es:three"]);
    expect(calls).toBe(0);
    expect(await probe.translate("es", ["one"])).toEqual(["again"]);
    expect(calls).toBe(1);
  });
});
