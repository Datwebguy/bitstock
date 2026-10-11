import { NextResponse, type NextRequest } from "next/server";
import { regionVerdict } from "@/lib/regions";

/**
 * Forwards a gift claim to the agent with the visitor's country, which only the edge network knows,
 * and a shared secret so the agent accepts claims only through this route. Restricted and unknown
 * places are refused here and again by the agent (AGENTS.md 0.5).
 */
export async function POST(request: NextRequest) {
  const country = request.headers.get("x-vercel-ip-country");
  const region = request.headers.get("x-vercel-ip-country-region");
  const v = regionVerdict(country, region);
  if (v.blocked) return NextResponse.json({ error: "Claims are not available in your region." }, { status: 451 });
  if (!v.known) return NextResponse.json({ error: "Your region could not be confirmed, so a claim cannot be made from here." }, { status: 451 });
  const agent = (process.env.NEXT_PUBLIC_AGENT_URL ?? "").replace(/\/+$/, "");
  const secret = process.env.GIFT_PROXY_SECRET;
  if (!agent || !secret) return NextResponse.json({ error: "The gift is not open." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { wallet?: unknown };
  const wallet = typeof body.wallet === "string" ? body.wallet : "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return NextResponse.json({ error: "The wallet address is not valid." }, { status: 400 });
  const ip = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
  const res = await fetch(`${agent}/v1/gift/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-gift-proxy-secret": secret, "x-claim-country": country ?? "", "x-claim-region": region ?? "", "x-claim-ip": ip },
    body: JSON.stringify({ wallet }),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Bitstock could not reach its server. Try again in a moment." }, { status: 502 });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(out, { status: res.status });
}
