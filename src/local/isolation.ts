// Local presentation isolation. Everything the demo starts must talk only to this computer:
// these checks run before any file write, CLI call, credential-bearing request, bootstrap or seed.

/**
 * Variables that make the Convex CLI select or authenticate against a cloud or self-hosted
 * deployment. The CLI reads them from the process environment and from `.env.local` / `.env`
 * (deploy keys take precedence over CONVEX_DEPLOYMENT), so none may reach a demo CLI call.
 */
export const CLOUD_SELECTORS = [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_OVERRIDE_ACCESS_TOKEN",
  "CONVEX_PROVISION_HOST",
] as const;

/** The only deployment selector the demo accepts: the CLI's accountless local deployment. */
export const LOCAL_DEPLOYMENT = /^anonymous:[A-Za-z0-9_-]{1,64}$/;

/** Variables passed to the Convex CLI and the demo web server; everything else is dropped. */
const PASS_THROUGH = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TZ",
  "TMPDIR", "TMP", "TEMP", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  // Needed on networks that route downloads (e.g. the one-time local backend binary) through a proxy.
  "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS",
  // Windows equivalents of HOME/TMP.
  "USERPROFILE", "LOCALAPPDATA", "APPDATA", "SystemRoot",
]);

export interface DemoPorts {
  /** WareOrb web server (and local agent service). */
  web: number;
  /** Local Convex backend: client API and HTTP actions. */
  convex: number;
  convexSite: number;
}

export class IsolationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Local demo refused to start:\n  - ${problems.join("\n  - ")}`);
    this.name = "IsolationError";
  }
}

const isPort = (n: number) => Number.isSafeInteger(n) && n >= 1024 && n <= 65535;

/** Ports from WAREORB_DEMO_PORT, WAREORB_CONVEX_PORT and WAREORB_CONVEX_SITE_PORT (defaults 3000, 3210, 3211). */
export function demoPorts(env: Record<string, string | undefined>): DemoPorts {
  const read = (name: string, fallback: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || !isPort(n)) throw new IsolationError([`${name}=${JSON.stringify(raw)} is not a port number from 1024 to 65535`]);
    return n;
  };
  const web = read("WAREORB_DEMO_PORT", 3000);
  const convex = read("WAREORB_CONVEX_PORT", 3210);
  const convexSite = read("WAREORB_CONVEX_SITE_PORT", convex + 1);
  if (new Set([web, convex, convexSite]).size !== 3) throw new IsolationError([`Ports must differ (web ${web}, Convex ${convex}, Convex site ${convexSite})`]);
  return { web, convex, convexSite };
}

/**
 * An exact loopback URL: `http://127.0.0.1:<port>` with nothing else (no credentials, path,
 * query or fragment). Returns the canonical origin or throws. A string-prefix check is not
 * enough: `http://127.0.0.1:3210@cloud.example` and `http://127.0.0.1.cloud.example` parse to
 * other hosts.
 */
export function loopbackUrl(value: string | undefined, name: string, port?: number): string {
  if (!value?.trim()) throw new IsolationError([`${name} is missing`]);
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new IsolationError([`${name} is not a URL`]); }
  const problems: string[] = [];
  if (url.protocol !== "http:") problems.push(`${name} must use http on this computer, not ${url.protocol}`);
  if (url.hostname !== "127.0.0.1") problems.push(`${name} must point at 127.0.0.1, not ${url.hostname || "an empty host"}`);
  if (url.username || url.password) problems.push(`${name} must not contain credentials`);
  if (url.search || url.hash || value.includes("?") || value.includes("#")) problems.push(`${name} must not have a query or fragment`);
  if (url.pathname !== "/" && url.pathname !== "") problems.push(`${name} must not have a path`);
  if (!url.port) problems.push(`${name} must name its port explicitly`);
  else if (port !== undefined && Number(url.port) !== port) problems.push(`${name} uses port ${url.port}; the demo expects ${port}`);
  if (problems.length) throw new IsolationError(problems);
  return `http://127.0.0.1:${url.port}`;
}

/** Parse a dotenv file the way the Convex CLI does for the keys that matter here. */
export function parseEnvFile(text: string | null): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2]!;
    if (/^'.*'$/.test(v) || /^".*"$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    values.set(m[1]!, v);
  }
  return values;
}

export interface PreflightInput {
  /** The demo process environment (Bun has already merged `.env*` files into it). */
  ambient: Record<string, string | undefined>;
  /** File contents, null when absent. The Convex CLI reads both itself. */
  envLocal: string | null;
  dotEnv: string | null;
  ports: DemoPorts;
}

export interface PreflightResult {
  /** Selector variables present in the ambient environment; they are never passed on. */
  droppedAmbient: string[];
  /** The deployment recorded in `.env.local`, when it is the accountless local one. */
  deployment: string | null;
}

/**
 * Check every source the Convex CLI reads. Cloud selectors in files are refused (the CLI would read
 * them regardless of our environment); the same keys in the ambient environment are dropped from
 * every child process and reported by name only.
 */
export function preflight(input: PreflightInput): PreflightResult {
  const problems: string[] = [];
  const files = [[".env.local", parseEnvFile(input.envLocal)], [".env", parseEnvFile(input.dotEnv)]] as const;
  for (const [file, values] of files) {
    for (const key of CLOUD_SELECTORS) if (values.get(key)) problems.push(`${file} sets ${key}, which points the Convex CLI at a cloud or self-hosted deployment. Move that file aside or use a separate checkout for the demo.`);
    const deployment = values.get("CONVEX_DEPLOYMENT");
    if (deployment && !LOCAL_DEPLOYMENT.test(deployment)) problems.push(`${file} selects CONVEX_DEPLOYMENT=${deployment.split(":")[0]}:…, not the accountless local deployment (anonymous:…). Move that file aside or use a separate checkout for the demo.`);
  }
  const local = files[0][1];
  for (const [key, port] of [["CONVEX_URL", input.ports.convex], ["CONVEX_SITE_URL", input.ports.convexSite]] as const) {
    const value = local.get(key);
    if (!value) continue;
    try { loopbackUrl(value, `.env.local ${key}`, port); } catch (e) { problems.push(...(e as IsolationError).problems); }
  }
  for (const [key, port] of [["CONVEX_URL", input.ports.convex], ["CONVEX_SITE_URL", input.ports.convexSite]] as const) {
    const value = files[1][1].get(key);
    if (value) try { loopbackUrl(value, `.env ${key}`, port); } catch (e) { problems.push(...(e as IsolationError).problems); }
  }
  if (problems.length) throw new IsolationError(problems);
  const droppedAmbient = CLOUD_SELECTORS.filter((k) => input.ambient[k]?.trim());
  const deployment = local.get("CONVEX_DEPLOYMENT") ?? null;
  return { droppedAmbient: [...droppedAmbient], deployment };
}

/** A child-process environment built from an allowlist, so no ambient selector or secret leaks in. */
export function childEnv(ambient: Record<string, string | undefined>, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(ambient)) if (v !== undefined && PASS_THROUGH.has(k)) env[k] = v;
  // Loopback traffic must never go through a proxy.
  const noProxy = [env.NO_PROXY ?? env.no_proxy, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  env.NO_PROXY = noProxy;
  env.no_proxy = noProxy;
  return { ...env, ...extra };
}

/** The settings the demo itself needs after the CLI has created the local deployment. */
export function localTarget(envLocal: string | null, ports: DemoPorts): { deployment: string; convexUrl: string; siteUrl: string } {
  const values = parseEnvFile(envLocal);
  const deployment = values.get("CONVEX_DEPLOYMENT");
  if (!deployment || !LOCAL_DEPLOYMENT.test(deployment)) throw new IsolationError([`.env.local does not select the accountless local deployment (found ${deployment ? `${deployment.split(":")[0]}:…` : "nothing"})`]);
  return {
    deployment,
    convexUrl: loopbackUrl(values.get("CONVEX_URL"), ".env.local CONVEX_URL", ports.convex),
    siteUrl: loopbackUrl(values.get("CONVEX_SITE_URL"), ".env.local CONVEX_SITE_URL", ports.convexSite),
  };
}
