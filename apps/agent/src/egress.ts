/** Country the server's outbound traffic appears to come from, via a public IP lookup. The address itself is not kept. */
export async function egressCountry(): Promise<{ country: string | null; source: string; error?: string }> {
  const source = "https://ipinfo.io/country";
  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(5000) });
    const text = (await res.text()).trim();
    if (!res.ok || !/^[A-Z]{2}$/.test(text)) return { country: null, source, error: `HTTP ${res.status}` };
    return { country: text, source };
  } catch (e) {
    return { country: null, source, error: e instanceof Error ? e.message : String(e) };
  }
}
