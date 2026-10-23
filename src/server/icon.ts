// POST /api/icon — Claude draws a small SVG product icon for a newly received furniture model.
import Anthropic from "@anthropic-ai/sdk";

export interface IconRequest {
  model: string;
  variant: string;
  category: string;
  color: string;
  kind: string;
}

const SYSTEM = `You draw product icons for a warehouse inventory app with a dark UI.
Return exactly one SVG document and nothing else.

Requirements:
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">, transparent background.
- A clean flat illustration of the single piece of furniture in a three-quarter view, centred, about 4px padding.
- Use the given material colour as the main fill, plus two or three lighter/darker tints of it for shading.
- Outline shapes with a 1.25px stroke in a dark tint of the material colour; stroke-linejoin="round".
- Simple geometry only: rect, path, circle, ellipse, polygon, line, g, and linearGradient. At most 40 elements.
- No text, no <script>, no <image>, no <foreignObject>, no external references, no event attributes.`;

let client: Anthropic | null = null;

/** Thrown when no Claude credentials are configured on the server. */
export class IconUnavailableError extends Error {}

function getClient() {
  if (!client) {
    try {
      client = new Anthropic();
    } catch (e) {
      throw new IconUnavailableError(e instanceof Error ? e.message : "Claude API credentials are not configured.");
    }
  }
  return client;
}

/** Keep only inert SVG: strips scripts, foreign content, event handlers and external links. */
export function sanitizeSvg(raw: string): string | null {
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let svg = match[0];
  svg = svg.replace(/<(script|foreignObject|image|iframe|style)[\s\S]*?<\/\1\s*>/gi, "");
  svg = svg.replace(/<(script|foreignObject|image|iframe|style)\b[^>]*\/>/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  svg = svg.replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
  svg = svg.replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none");
  if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg.length <= 24_000 ? svg : null;
}

export async function generateIcon(req: IconRequest): Promise<string> {
  const anthropic = getClient();
  const prompt = `Furniture: ${req.model} — ${req.variant}
Category: ${req.category} (3D shape in the app: ${req.kind})
Material colour: ${req.color}`;

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new IconUnavailableError(e.message);
    }
    // Network and API failures are APIError subclasses. Anything else failed before a request was
    // sent, which in practice means no credentials are configured (the SDK throws a plain Error).
    if (!(e instanceof Anthropic.APIError)) {
      throw new IconUnavailableError(e instanceof Error ? e.message : "Claude API credentials are not configured.");
    }
    throw e;
  }

  if (response.stop_reason === "refusal") throw new Error("The model declined to draw this icon.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const svg = sanitizeSvg(text);
  if (!svg) throw new Error("The model did not return a usable SVG.");
  return svg;
}

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function handleIconRequest(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const input: IconRequest = {
    model: str(body?.model),
    variant: str(body?.variant),
    category: str(body?.category, 40),
    color: /^#[0-9a-f]{6}$/i.test(str(body?.color, 7)) ? str(body?.color, 7) : "#8b8f98",
    kind: str(body?.kind, 20),
  };
  if (!input.model) return Response.json({ error: "Model name is required." }, { status: 400 });
  try {
    return Response.json({ svg: await generateIcon(input) });
  } catch (e) {
    if (e instanceof IconUnavailableError) {
      return Response.json({ error: "AI icons need Claude API credentials (set ANTHROPIC_API_KEY)." }, { status: 501 });
    }
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Rate limited — try again shortly." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: e.message }, { status: 502 });
    return Response.json({ error: e instanceof Error ? e.message : "Icon generation failed." }, { status: 500 });
  }
}
