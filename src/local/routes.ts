// Routes the WareOrb server adds in local presentation mode (WAREORB_LOCAL_DEMO=1). Bound to 127.0.0.1.
import { timingSafeEqual } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { LOCAL_DEMO_PRESENTER } from "../domain/local-demo";
import { agentStatus, readDeliveryEvidence, runAnalystTurn, type AgentEvent, type ReadInput } from "./agent";
import { mintDemoToken } from "./demo-identity";
import { warehouseTools } from "./warehouse-tools";

export interface LocalDemoConfig {
  port: number;
  convexUrl: string;
  privateJwk: string;
  agentSecret: string;
}

const noStore = { "Cache-Control": "no-store" };
const deny = (status: number, error: string) => Response.json({ error }, { status, headers: noStore });

export function localDemoRoutes(cfg: LocalDemoConfig) {
  const hosts = new Set([`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`]);
  /** Only this page may use the presenter's identity: blocks other sites and DNS rebinding. */
  const fromThisApp = (req: Request) => {
    if (!hosts.has(req.headers.get("host") ?? "")) return false;
    const origin = req.headers.get("origin");
    if (!origin) return req.method === "GET";
    try { return hosts.has(new URL(origin).host); } catch { return false; }
  };
  const fromBackend = (req: Request) => {
    const given = Buffer.from(req.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${cfg.agentSecret}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  /** The agent reads through the same authorised query as the presenter's screen. */
  const snapshot = async () => {
    const client = new ConvexHttpClient(cfg.convexUrl);
    client.setAuth((await mintDemoToken(cfg.privateJwk, LOCAL_DEMO_PRESENTER, 300)).token);
    return await client.query(api.ledger.snapshot, { since: 0 });
  };

  return {
    "/api/demo/token": {
      GET: async (req: Request) => {
        if (!fromThisApp(req)) return deny(403, "Local presentation identity is only available to this app");
        return Response.json(await mintDemoToken(cfg.privateJwk, LOCAL_DEMO_PRESENTER), { headers: noStore });
      },
    },
    "/api/agent/status": {
      GET: async (req: Request) => (fromThisApp(req) ? Response.json(await agentStatus(), { headers: noStore }) : deny(403, "Forbidden")),
    },
    "/api/agent/chat": {
      POST: async (req: Request) => {
        if (!fromThisApp(req) || !req.headers.get("content-type")?.startsWith("application/json")) return deny(403, "Forbidden");
        const body = (await req.json().catch(() => null)) as { sessionId?: unknown; text?: unknown } | null;
        const sessionId = typeof body?.sessionId === "string" && /^[\w-]{8,64}$/.test(body.sessionId) ? body.sessionId : null;
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!sessionId || !text || text.length > 2000) return deny(400, "A session id and a 1–2000 character question are required");
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
            try { await runAnalystTurn(sessionId, text, () => warehouseTools(snapshot), emit); }
            catch (e) { emit({ type: "error", message: e instanceof Error ? e.message : "The agent failed" }); }
            finally { controller.close(); }
          },
        });
        return new Response(stream, { headers: { ...noStore, "Content-Type": "text/event-stream" } });
      },
    },
    "/internal/extract-receipt": {
      POST: async (req: Request) => {
        if (!hosts.has(req.headers.get("host") ?? "") || !fromBackend(req)) return deny(401, "Unauthorised");
        const body = (await req.json().catch(() => null)) as Partial<ReadInput> | null;
        if (!body || !Array.isArray(body.catalogue) || !Array.isArray(body.evidence) || body.evidence.length > 20) return deny(400, "Invalid reading request");
        const result = await readDeliveryEvidence({ catalogue: body.catalogue.slice(0, 500), evidence: body.evidence });
        if ("error" in result) return deny(422, result.error);
        return Response.json({ ...(result.draft as object), model: result.model }, { headers: noStore });
      },
    },
  };
}
