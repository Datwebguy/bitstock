import { findMarketStatus } from "../src/finders.ts";
import { makeApi, NVDAB, setLabel, show } from "./lib.ts";

const api = makeApi();

setLabel("01-rwa-tokens-bstock");
const tokens = (await api.rwaTokens("bstock")) as unknown;
const list = Array.isArray(tokens) ? tokens : ((tokens as { tokens?: unknown[]; list?: unknown[] })?.tokens ?? (tokens as { list?: unknown[] })?.list ?? []);
console.log("top-level type:", Array.isArray(tokens) ? "array" : typeof tokens, "keys:", Array.isArray(tokens) ? "-" : Object.keys(tokens as object));
console.log("token count:", (list as unknown[]).length);
const nvdab = (list as Array<Record<string, unknown>>).find((t) => String(t["tokenSymbol"]).toUpperCase() === "NVDAB" || String(t["tokenContractAddress"]).toLowerCase() === NVDAB.toLowerCase());
console.log("NVDAB entry:");
show(nvdab);
console.log("market-status object found by shape:");
show(findMarketStatus(nvdab));

setLabel("02-rwa-underlying-profile-nvdab");
console.log("underlying-profile:");
show(await api.underlyingProfile(NVDAB));

setLabel("03-rwa-underlying-market-nvdab");
console.log("underlying-market:");
show(await api.underlyingMarket(NVDAB));

setLabel("04-rwa-price-nvdab");
console.log("price:");
show(await api.rwaPrice([NVDAB]));
