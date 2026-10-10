import { describe, expect, it } from "vitest";
import { variableStatus } from "../src/config.ts";

describe("variableStatus", () => {
  it("reports names with booleans only, never values", () => {
    const s = variableStatus({ BINANCE_WEB3_API_KEY: "secret-value", ADMIN_TOKEN: "" });
    expect(s.required["BINANCE_WEB3_API_KEY"]).toBe(true);
    expect(s.required["ADMIN_TOKEN"]).toBe(false);
    expect(s.required["BSC_RPC_URL"]).toBe(false);
    expect(JSON.stringify(s)).not.toContain("secret-value");
  });
});
