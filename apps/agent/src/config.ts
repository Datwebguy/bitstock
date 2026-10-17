/** Variables the service needs. Only names are ever reported, never values. */
export const REQUIRED_VARIABLES = ["BINANCE_WEB3_API_KEY", "BINANCE_WEB3_API_SECRET", "BSC_RPC_URL", "ADMIN_TOKEN"] as const;
export const OPTIONAL_VARIABLES = ["PYTH_API_KEY", "PROBE_WALLET_ADDRESS", "KILL_SWITCH", "GIFT_CAMPAIGN_MAX_USD", "GIFT_TEST_POOL_USD", "GIFT_RELAYER_MAX_BNB", "OPENAI_API_KEY"] as const;

export function variableStatus(env: NodeJS.ProcessEnv): { required: Record<string, boolean>; optional: Record<string, boolean> } {
  const flag = (names: readonly string[]) => Object.fromEntries(names.map((n) => [n, Boolean(env[n])]));
  return { required: flag(REQUIRED_VARIABLES), optional: flag(OPTIONAL_VARIABLES) };
}
