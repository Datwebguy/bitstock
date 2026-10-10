import { createHmac } from "node:crypto";

/** The API signs the full path including this prefix. Omitting it gives 40102 (docs/VERIFIED.md section 2). */
export const SIGNED_PATH_PREFIX = "/build";

export type HttpMethod = "GET" | "POST";

export interface SignInput {
  secret: string;
  /** ISO 8601 with milliseconds, e.g. 2026-05-11T10:08:57.715Z. */
  timestamp: string;
  method: HttpMethod;
  /** Path including the /build prefix and the raw URL-encoded query string, in the order sent. */
  requestPath: string;
  /** Raw JSON string for POST, empty for GET. */
  body: string;
}

/** Base64(HMAC-SHA256(secret, timestamp + METHOD + requestPath + body)). */
export function sign(input: SignInput): string {
  const payload = input.timestamp + input.method + input.requestPath + input.body;
  return createHmac("sha256", input.secret).update(payload).digest("base64");
}

/** Query string in insertion order, URL-encoded once. The same string is signed and sent. */
export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join("&");
}

/** Signed path for an API path such as /api/v1/dex/market/rwa/tokens. */
export function signedPath(apiPath: string, query: string): string {
  return SIGNED_PATH_PREFIX + apiPath + (query ? `?${query}` : "");
}
