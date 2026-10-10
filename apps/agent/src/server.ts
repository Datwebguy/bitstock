import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isAdmin } from "./auth.ts";
import { variableStatus } from "./config.ts";
import { egressCountry } from "./egress.ts";
import { PROBE_NAMES, runProbe } from "./probes.ts";

const SERVICE = "bitstock-agent";

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body, null, 2));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });

  if (url.pathname === "/healthz") {
    const egress = await egressCountry();
    return send(res, 200, {
      service: SERVICE,
      commit: process.env["RAILWAY_GIT_COMMIT_SHA"] ?? null,
      host: { platform: process.env["RAILWAY_PUBLIC_DOMAIN"] ? "railway" : null, region: process.env["RAILWAY_REPLICA_REGION"] ?? null },
      egress,
      variables: variableStatus(process.env),
      at: new Date().toISOString(),
    });
  }

  if (url.pathname === "/v1/admin/probe") {
    if (!isAdmin(req.headers.authorization, process.env["ADMIN_TOKEN"])) return send(res, 401, { error: "unauthorized" });
    const n = Number(url.searchParams.get("n"));
    if (!Number.isInteger(n) || n < 1 || n > 7) return send(res, 400, { error: "n must be an integer from 1 to 7", probes: PROBE_NAMES });
    return send(res, 200, await runProbe(n, process.env));
  }

  send(res, 404, { error: "not found" });
}

const port = Number(process.env["PORT"] ?? 3000);
createServer((req, res) => {
  handle(req, res).catch((e: unknown) => {
    console.error(JSON.stringify({ level: "error", msg: e instanceof Error ? e.message : String(e) }));
    send(res, 500, { error: "internal error" });
  });
}).listen(port, () => console.log(JSON.stringify({ level: "info", msg: "listening", service: SERVICE, port })));
