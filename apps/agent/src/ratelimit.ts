/** Fixed-window rate limit per client key. Small and in memory: one instance serves the app. */
export class RateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #hits = new Map<string, { start: number; count: number }>();
  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }
  allow(key: string, now = Date.now()): boolean {
    const h = this.#hits.get(key);
    if (!h || now - h.start >= this.#windowMs) {
      this.#hits.set(key, { start: now, count: 1 });
      if (this.#hits.size > 10_000) for (const [k, v] of this.#hits) if (now - v.start >= this.#windowMs) this.#hits.delete(k);
      return true;
    }
    h.count++;
    return h.count <= this.#limit;
  }
}
