/** Minimal JSON-RPC over fetch. Every call is timed; errors keep the node's own message. */

export class RpcError extends Error {
  readonly code: number | undefined;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

export interface RpcCallResult<T> {
  result: T;
  latencyMs: number;
}

export async function rpcCall<T>(url: string, method: string, params: unknown[], timeoutMs = 15_000): Promise<RpcCallResult<T>> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new RpcError(`RPC unreachable: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const json = (await res.json().catch(() => undefined)) as { result?: T; error?: { code: number; message: string } } | undefined;
  if (!json) throw new RpcError(`RPC answered HTTP ${res.status} with a body that is not JSON`);
  if (json.error) throw new RpcError(json.error.message, json.error.code);
  return { result: json.result as T, latencyMs: Date.now() - started };
}

/** eth_call at the latest block. Returns the raw 0x-hex result. */
export async function ethCall(url: string, to: string, data: string): Promise<RpcCallResult<string>> {
  return rpcCall<string>(url, "eth_call", [{ to, data }, "latest"]);
}
