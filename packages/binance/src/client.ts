import { appendFileSync } from "node:fs";
import { BinanceApiError, BinanceUnavailableError } from "./errors.ts";
import { buildQuery, sign, signedPath, type HttpMethod } from "./sign.ts";

export const DEFAULT_BASE_URL = "https://web3.binance.com";
/** Read endpoints are cached this long (AGENTS.md section 5). */
export const DEFAULT_CACHE_TTL_MS = 30_000;

export interface Envelope<T> {
  code: number | string;
  msg: string;
  data: T;
  timestamp?: number;
  success?: boolean;
}

/** One line of docs/evidence/calls.jsonl. Never holds a key, secret or signature. */
export interface CallLogEntry {
  at: string;
  method: HttpMethod;
  path: string;
  query: string;
  httpStatus: number | null;
  code: number | null;
  latencyMs: number;
  cached: boolean;
  attempt: number;
  error?: string;
}

/** The full parsed response, for saving raw evidence. */
export interface RawResponse {
  method: HttpMethod;
  path: string;
  query: string;
  body: string;
  httpStatus: number;
  json: unknown;
}

export interface ClientOptions {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  /** Append one JSON line per call here. */
  callLogPath?: string;
  onRaw?: (raw: RawResponse) => void;
  cacheTtlMs?: number;
  maxRetries?: number;
  recvWindowMs?: number;
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface CacheEntry {
  expires: number;
  data: unknown;
}

export class BinanceClient {
  readonly #apiKey: string;
  readonly #apiSecret: string;
  readonly #baseUrl: string;
  readonly #callLogPath: string | undefined;
  readonly #onRaw: ((raw: RawResponse) => void) | undefined;
  readonly #cacheTtlMs: number;
  readonly #maxRetries: number;
  readonly #recvWindowMs: number | undefined;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #cache = new Map<string, CacheEntry>();

  constructor(options: ClientOptions) {
    if (!options.apiKey || !options.apiSecret) throw new Error("Binance API key and secret are required.");
    this.#apiKey = options.apiKey;
    this.#apiSecret = options.apiSecret;
    this.#baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#callLogPath = options.callLogPath;
    this.#onRaw = options.onRaw;
    this.#cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.#maxRetries = options.maxRetries ?? 3;
    this.#recvWindowMs = options.recvWindowMs;
    this.#timeoutMs = options.requestTimeoutMs ?? 15_000;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Signed GET. Cached for the configured TTL. */
  get<T>(apiPath: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    return this.#request<T>("GET", apiPath, buildQuery(params), "", true);
  }

  /** Signed POST with a JSON body. Never cached. */
  post<T>(apiPath: string, body: unknown): Promise<T> {
    return this.#request<T>("POST", apiPath, "", JSON.stringify(body), false);
  }

  async #request<T>(method: HttpMethod, apiPath: string, query: string, body: string, cacheable: boolean): Promise<T> {
    const requestPath = signedPath(apiPath, query);
    const cacheKey = `${method} ${requestPath}`;

    if (cacheable && this.#cacheTtlMs > 0) {
      const hit = this.#cache.get(cacheKey);
      if (hit && hit.expires > this.#now()) {
        this.#log({ method, path: apiPath, query, httpStatus: null, code: null, latencyMs: 0, cached: true, attempt: 0 });
        return hit.data as T;
      }
    }

    for (let attempt = 1; ; attempt++) {
      const started = this.#now();
      let res: Response;
      let text: string;
      try {
        const timestamp = new Date(this.#now()).toISOString();
        const headers: Record<string, string> = {
          "X-OC-APIKEY": this.#apiKey,
          "X-OC-TIMESTAMP": timestamp,
          "X-OC-SIGN": sign({ secret: this.#apiSecret, timestamp, method, requestPath, body }),
        };
        if (this.#recvWindowMs !== undefined) headers["X-OC-RECV-WINDOW"] = String(this.#recvWindowMs);
        if (method === "POST") headers["Content-Type"] = "application/json";
        const init: RequestInit = { method, headers, signal: AbortSignal.timeout(this.#timeoutMs) };
        if (method === "POST") init.body = body;
        res = await this.#fetch(this.#baseUrl + requestPath, init);
        text = await res.text();
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause);
        this.#log({ method, path: apiPath, query, httpStatus: null, code: null, latencyMs: this.#now() - started, cached: false, attempt, error });
        throw new BinanceUnavailableError(`Binance Web3 API could not be reached: ${error}`, { cause });
      }

      const latencyMs = this.#now() - started;
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      const env = asEnvelope(json);
      const code = env ? Number(env.code) : null;
      this.#log({ method, path: apiPath, query, httpStatus: res.status, code, latencyMs, cached: false, attempt });
      this.#onRaw?.({ method, path: apiPath, query, body, httpStatus: res.status, json: json ?? text });

      if (res.status === 429 || code === 42900) {
        if (attempt > this.#maxRetries) throw new BinanceApiError(42900, res.status, env?.msg ?? "rate limited");
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.#sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1));
        continue;
      }
      if (!env) {
        throw new BinanceUnavailableError(`Binance Web3 API answered HTTP ${res.status} with something that is not the documented envelope.`);
      }
      if (code !== 0) throw new BinanceApiError(code ?? -1, res.status, env.msg);

      if (cacheable && this.#cacheTtlMs > 0) this.#cache.set(cacheKey, { expires: this.#now() + this.#cacheTtlMs, data: env.data });
      return env.data as T;
    }
  }

  #log(entry: Omit<CallLogEntry, "at">): void {
    if (!this.#callLogPath) return;
    const line: CallLogEntry = { at: new Date(this.#now()).toISOString(), ...entry };
    appendFileSync(this.#callLogPath, JSON.stringify(line) + "\n");
  }
}

function asEnvelope(json: unknown): Envelope<unknown> | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const o = json as Record<string, unknown>;
  if (!("code" in o) || Number.isNaN(Number(o["code"]))) return undefined;
  return { code: o["code"] as number | string, msg: typeof o["msg"] === "string" ? o["msg"] : "", data: o["data"] };
}
