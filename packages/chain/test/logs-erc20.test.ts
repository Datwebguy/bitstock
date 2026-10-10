import { describe, expect, it } from "vitest";
import { decodeRevertReason, transferCalldata } from "../src/erc20.ts";
import { decodeMultiplierUpdated, UI_MULTIPLIER_UPDATED_TOPIC } from "../src/logs.ts";

const w = (v: bigint) => v.toString(16).padStart(64, "0");
// Test fixtures built from the ERC-8056 event signature; no NVDAB log has been retrieved yet (docs/evidence/nvdab-event-search.json).
const base = { address: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", blockNumber: "0x10", transactionHash: "0xab", logIndex: "0x2" };

describe("UIMultiplierUpdated decoding", () => {
  it("has the topic recorded in docs/VERIFIED.md", () => {
    expect(UI_MULTIPLIER_UPDATED_TOPIC).toBe("0x2205df4534432b2f60654a3fdb48737ffdaf3e9edb1a498bd985bc026b15b055");
  });
  it("decodes the all-in-data layout", () => {
    const d = decodeMultiplierUpdated({ ...base, topics: [UI_MULTIPLIER_UPDATED_TOPIC], data: "0x" + w(10n ** 18n) + w(1000778223752807865n) + w(1789000000n) });
    expect(d).toMatchObject({ oldMultiplier: 10n ** 18n, newMultiplier: 1000778223752807865n, effectiveAt: 1789000000n, blockNumber: 16n, logIndex: 2 });
  });
  it("decodes the all-indexed layout", () => {
    const d = decodeMultiplierUpdated({ ...base, topics: [UI_MULTIPLIER_UPDATED_TOPIC, "0x" + w(1n), "0x" + w(2n), "0x" + w(3n)], data: "0x" });
    expect([d.oldMultiplier, d.newMultiplier, d.effectiveAt]).toEqual([1n, 2n, 3n]);
  });
  it("refuses other events, short data and a mixed layout", () => {
    expect(() => decodeMultiplierUpdated({ ...base, topics: ["0x" + w(9n)], data: "0x" })).toThrow();
    expect(() => decodeMultiplierUpdated({ ...base, topics: [UI_MULTIPLIER_UPDATED_TOPIC], data: "0x" + w(1n) })).toThrow(/too short/);
    expect(() => decodeMultiplierUpdated({ ...base, topics: [UI_MULTIPLIER_UPDATED_TOPIC, "0x" + w(1n)], data: "0x" + w(2n) + w(3n) })).toThrow(/layout/);
  });
});

describe("ERC-20 transfer helpers", () => {
  it("builds transfer calldata", () => {
    expect(transferCalldata("0x3535353535353535353535353535353535353535", 1n)).toBe("0xa9059cbb" + "0".repeat(24) + "35".repeat(20) + w(1n));
    expect(() => transferCalldata("0x35", 1n)).toThrow();
    expect(() => transferCalldata("0x3535353535353535353535353535353535353535", 0n)).toThrow();
  });
  it("decodes an Error(string) revert reason", () => {
    const msg = Buffer.from("ERC20: transfer amount exceeds balance").toString("hex");
    const data = "0x08c379a0" + w(32n) + w(BigInt(msg.length / 2)) + msg.padEnd(Math.ceil(msg.length / 64) * 64, "0");
    expect(decodeRevertReason(data)).toBe("ERC20: transfer amount exceeds balance");
    expect(decodeRevertReason("0x")).toBeUndefined();
    expect(decodeRevertReason(undefined)).toBeUndefined();
  });
});
