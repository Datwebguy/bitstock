/** Plain-language sentences for the error codes seen in docs/VERIFIED.md. Unknown codes keep the raw message. */
const KNOWN: Record<number, string> = {
  40101: "The Binance Web3 API key is missing.",
  40102: "The Binance Web3 API rejected the signature. Check the key, secret, timestamp and that the signed path starts with /build.",
  40367: "The underlying stock exchange is closed, so this Ondo token cannot be quoted right now.",
  40369: "The underlying stock exchange is closed, so this stock token cannot be quoted right now.",
  40401: "The quote expired. Ask for a new one.",
  40462: "The quote and the swap request do not match (direction or fee). Ask for a new quote.",
  42900: "Binance is rate limiting requests. Waiting before trying again.",
};

export function plainMessage(code: number, rawMsg: string): string {
  return KNOWN[code] ?? `Binance returned error ${code}: ${rawMsg}`;
}

export class BinanceApiError extends Error {
  readonly code: number;
  readonly httpStatus: number;
  readonly rawMsg: string;
  constructor(code: number, httpStatus: number, rawMsg: string) {
    super(plainMessage(code, rawMsg));
    this.name = "BinanceApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.rawMsg = rawMsg;
  }
}

/** The service could not be reached or answered with something that is not the documented envelope. */
export class BinanceUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BinanceUnavailableError";
  }
}
