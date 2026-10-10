import { describe, expect, it } from "vitest";
import { buildQuery, sign, signedPath } from "../src/sign.ts";

// Expected values were computed independently with:
//   printf '%s' "<timestamp><METHOD><path><body>" | openssl dgst -sha256 -hmac "<secret>" -binary | base64
const secret = "test-secret-not-real";
const timestamp = "2026-10-10T12:00:00.123Z";

describe("sign", () => {
  it("matches an independently computed GET signature", () => {
    const requestPath = "/build/api/v1/dex/market/rwa/tokens?binanceChainId=56&platformId=bstock";
    expect(sign({ secret, timestamp, method: "GET", requestPath, body: "" })).toBe("gzDlEbvYsUZJFldj5kCE+n2X2gDIMBwj4pavFS0St1c=");
  });

  it("matches an independently computed POST signature with a body", () => {
    const body = '{"binanceChainId":"56","evmTx":{"from":"0x1","to":"0x2","value":"0","data":"0x"}}';
    expect(sign({ secret, timestamp, method: "POST", requestPath: "/build/api/v1/dex/pre-transaction/simulate", body })).toBe(
      "PpK1F4scdO+KqIP7jrC+JoxUt5L8ofnwJejreZekW6Q=",
    );
  });

  it("changes when the /build prefix is left out (the documented 40102 cause)", () => {
    const withoutPrefix = sign({ secret, timestamp, method: "GET", requestPath: "/api/v1/dex/market/rwa/tokens?binanceChainId=56&platformId=bstock", body: "" });
    expect(withoutPrefix).toBe("v+IDIvDtnBuLjCV6ILNJViaKt2mPq8BCwo0amiAbmeM=");
    expect(withoutPrefix).not.toBe("gzDlEbvYsUZJFldj5kCE+n2X2gDIMBwj4pavFS0St1c=");
  });
});

describe("signedPath", () => {
  it("always includes the /build prefix", () => {
    expect(signedPath("/api/v1/x", "a=1")).toBe("/build/api/v1/x?a=1");
    expect(signedPath("/api/v1/x", "")).toBe("/build/api/v1/x");
  });
});

describe("buildQuery", () => {
  it("keeps insertion order, skips undefined, encodes once", () => {
    expect(buildQuery({ b: "2", a: "x y&z", skip: undefined, n: 56, t: true })).toBe("b=2&a=x%20y%26z&n=56&t=true");
  });
  it("is empty for no parameters", () => {
    expect(buildQuery({})).toBe("");
  });
});
