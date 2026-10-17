import { BinanceClient } from "./client.ts";

/** Chain ID for BNB Smart Chain. */
export const BSC_CHAIN_ID = 56;

/**
 * Typed from the fields in docs/VERIFIED.md section 3. Fields the reference only lists as
 * "object" or marks UNVERIFIED stay loose until a live probe settles them (docs/evidence/).
 */
export interface RwaToken {
  tokenContractAddress: string;
  platformId: string;
  assetType: number;
  tokenName: string;
  tokenSymbol: string;
  decimals: number | string;
  underlyingTicker: string;
  underlyingName: string;
  tokenPrice: string;
  referencePrice: string;
  [key: string]: unknown;
}

export interface RwaPrice {
  tokenContractAddress?: string;
  tokenPrice: string;
  referencePrice: string;
  tokenPriceUpdatedAt: number | string;
  [key: string]: unknown;
}

export interface QuoteRoute {
  quoteId: string;
  vendorName: string;
  toTokenAmount: string;
  priceImpactPercent: string;
  executionMode: "SWAP" | "RFQ" | (string & {});
  approveTarget?: string;
  isBest?: boolean;
  estimateGasFee?: string;
  [key: string]: unknown;
}

export interface QuoteParams {
  fromTokenAddress: string;
  toTokenAddress: string;
  /** Smallest unit of the from token. */
  amount: string;
  userWalletAddress: string;
  vendor?: string;
  feePercent?: string;
  feeSource?: string;
}

export interface SwapParams extends QuoteParams {
  quoteId: string;
  slippagePercent?: string;
  autoSlippage?: boolean;
  fromTokenReferrerWalletAddress?: string;
  toTokenReferrerWalletAddress?: string;
}

export interface EvmTx {
  from: string;
  to: string;
  value: string;
  data: string;
}

export interface BalanceChange {
  contractAddress: string;
  tokenType: string;
  change: string;
  owner: string;
}

export interface SimulationResult {
  status: "SUCCESS" | "FAILED" | (string & {});
  failReason?: string;
  balanceChanges?: BalanceChange[];
  allowanceChanges?: unknown[];
  [key: string]: unknown;
}

const RWA = "/api/v1/dex/market/rwa";
const AGG = "/api/v1/dex/aggregator";
const PRE = "/api/v1/dex/pre-transaction";

/** One method per endpoint. The chain parameter defaults to BSC because this build is BSC-only. */
export class BinanceApi {
  readonly client: BinanceClient;
  constructor(client: BinanceClient) {
    this.client = client;
  }

  rwaTokens(platformId: "bstock" | "ondo", tabId?: number): Promise<unknown> {
    return this.client.get(`${RWA}/tokens`, { binanceChainId: BSC_CHAIN_ID, platformId, tabId });
  }

  rwaPrice(tokenContractAddresses: string[]): Promise<RwaPrice[]> {
    return this.client.get(`${RWA}/price`, { binanceChainId: BSC_CHAIN_ID, tokenContractAddresses: tokenContractAddresses.join(",") });
  }

  rwaSearch(keyword: string, platformId?: string): Promise<unknown> {
    return this.client.get(`${RWA}/search`, { keyword, platformId });
  }

  underlyingProfile(tokenContractAddress: string): Promise<unknown> {
    return this.client.get(`${RWA}/underlying-profile`, { binanceChainId: BSC_CHAIN_ID, tokenContractAddress });
  }

  underlyingMarket(tokenContractAddress: string): Promise<unknown> {
    return this.client.get(`${RWA}/underlying-market`, { binanceChainId: BSC_CHAIN_ID, tokenContractAddress });
  }

  quote(p: QuoteParams): Promise<unknown> {
    return this.client.getFresh(`${AGG}/quote`, { binanceChainId: BSC_CHAIN_ID, ...p });
  }

  swap(p: SwapParams): Promise<unknown> {
    return this.client.getFresh(`${AGG}/swap`, { binanceChainId: BSC_CHAIN_ID, ...p });
  }

  quoteAndSwap(p: QuoteParams & { slippagePercent?: string; autoSlippage?: boolean }): Promise<unknown> {
    return this.client.getFresh(`${AGG}/quote-and-swap`, { binanceChainId: BSC_CHAIN_ID, vendor: "LiquidMesh", ...p });
  }

  approveTransaction(p: { tokenContractAddress: string; approveAmount: string; vendor?: string }): Promise<unknown> {
    return this.client.get(`${AGG}/approve-transaction`, { binanceChainId: BSC_CHAIN_ID, ...p });
  }

  simulate(evmTx: EvmTx): Promise<SimulationResult> {
    return this.client.post(`${PRE}/simulate`, { binanceChainId: String(BSC_CHAIN_ID), evmTx });
  }

  gasLimit(body: unknown): Promise<unknown> {
    return this.client.post(`${PRE}/gas-limit`, body);
  }

  broadcast(p: { signedTransaction: string; address: string; enableMevProtection?: boolean }): Promise<unknown> {
    return this.client.post(`${PRE}/broadcast-transaction`, { binanceChainId: String(BSC_CHAIN_ID), ...p });
  }

  transactionDetail(txHash: string): Promise<unknown> {
    return this.client.getFresh("/api/v1/dex/post-transaction/transaction-detail-by-txhash", { binanceChainId: BSC_CHAIN_ID, txHash });
  }
}
