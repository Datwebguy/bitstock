import { describe, expect, it } from "vitest";
import { isAdmin } from "../src/auth.ts";

describe("isAdmin", () => {
  it("accepts the exact bearer token", () => {
    expect(isAdmin("Bearer abc123", "abc123")).toBe(true);
  });
  it("rejects a wrong token, a wrong length, and a wrong scheme", () => {
    expect(isAdmin("Bearer abc124", "abc123")).toBe(false);
    expect(isAdmin("Bearer abc", "abc123")).toBe(false);
    expect(isAdmin("Basic abc123", "abc123")).toBe(false);
  });
  it("rejects everything when no token is configured (fail closed)", () => {
    expect(isAdmin("Bearer ", undefined)).toBe(false);
    expect(isAdmin("Bearer x", "")).toBe(false);
  });
  it("rejects a missing header", () => {
    expect(isAdmin(undefined, "abc123")).toBe(false);
  });
});
