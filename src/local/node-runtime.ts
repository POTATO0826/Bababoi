// The local Convex backend runs "use node" actions only on Node.js 20, 22 or 24. Find one without
// assuming a Mac: WAREORB_CONVEX_NODE, then PATH, then common Homebrew, Linux and version-manager paths.
import { posix, win32 } from "node:path";

export const SUPPORTED_NODE = [20, 22, 24] as const;

export interface NodeProbe {
  env: Record<string, string | undefined>;
  platform: string;
  home: string;
  which(cmd: string): string | null;
  exists(path: string): boolean;
  isDir(path: string): boolean;
  listDir(path: string): string[];
  /** `node --version` output for a binary, or null if it cannot run. */
  version(bin: string): string | null;
}

const major = (v: string | null) => (v ? Number(v.trim().replace(/^v/, "").split(".")[0]) : NaN);

export function installHint(platform: string): string {
  if (platform === "darwin") return "Install it once with `brew install node@24` (it can stay keg-only), or set WAREORB_CONVEX_NODE=/path/to/node.";
  if (platform === "linux") return "Install Node.js 24 (for example `nvm install 24`, `fnm install 24`, or your distribution's nodejs 24 package), or set WAREORB_CONVEX_NODE=/path/to/node.";
  return "Install Node.js 24 from nodejs.org, then reopen your terminal; or set $env:WAREORB_CONVEX_NODE = 'C:\\Program Files\\nodejs\\node.exe' in PowerShell.";
}

/** Returns the directory to put first on PATH for the Convex CLI, or throws with platform-specific instructions. */
export function findConvexNode(p: NodeProbe): string {
  const windows = p.platform === "win32";
  const { dirname, join } = windows ? win32 : posix;
  const executable = windows ? "node.exe" : "node";
  const env = (name: string) => p.env[name] ?? (windows ? Object.entries(p.env).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] : undefined);
  const supported = (bin: string) => p.exists(bin) && (SUPPORTED_NODE as readonly number[]).includes(major(p.version(bin)));
  const explicit = p.env.WAREORB_CONVEX_NODE?.trim();
  if (explicit) {
    const bin = p.isDir(explicit) ? join(explicit, executable) : explicit;
    if (!p.exists(bin)) throw new Error(`WAREORB_CONVEX_NODE=${explicit} does not contain a node binary.`);
    const v = p.version(bin);
    if (!supported(bin)) throw new Error(`WAREORB_CONVEX_NODE points at Node.js ${v?.trim() ?? "(unreadable)"}; the local Convex backend needs Node.js ${SUPPORTED_NODE.join(", ")}. ${installHint(p.platform)}`);
    return dirname(bin);
  }
  const fromPath = p.which("node");
  // Use the resolved executable itself (Windows resolves PATHEXT to node.exe).
  if (fromPath && supported(fromPath)) return dirname(fromPath);
  const versioned = (dir: string, suffix: string[] = ["bin"]) => p.isDir(dir) ? p.listDir(dir).filter((v) => SUPPORTED_NODE.includes(major(v) as 20)).sort((a, b) => major(b) - major(a)).map((v) => join(dir, v, ...suffix)) : [];
  const programFiles = env("ProgramFiles");
  const nvmHome = env("NVM_HOME");
  const dirs = [
    fromPath ? dirname(fromPath) : "",
    ...(p.platform === "darwin" ? ["/opt/homebrew/opt/node@24/bin", "/opt/homebrew/opt/node@22/bin", "/opt/homebrew/opt/node@20/bin", "/usr/local/opt/node@24/bin", "/usr/local/opt/node@22/bin", "/usr/local/opt/node@20/bin"] : []),
    ...(p.platform === "linux" ? ["/opt/node24/bin", "/opt/node22/bin", "/opt/node20/bin", "/usr/local/bin", "/usr/bin"] : []),
    ...(windows ? [
      env("NVM_SYMLINK") ?? "", env("FNM_MULTISHELL_PATH") ?? "",
      programFiles ? join(programFiles, "nodejs") : "",
      ...(nvmHome ? versioned(nvmHome, []) : []),
    ] : []),
    ...versioned(join(p.home, ".nvm", "versions", "node")),
    ...versioned(join(p.home, ".local", "share", "fnm", "node-versions")).map((d) => d.replace(/bin$/, join("installation", "bin"))),
    join(p.home, ".volta", "bin"),
  ].filter(Boolean);
  for (const dir of dirs) if (supported(join(dir, executable))) return dir;
  const found = fromPath ? ` (PATH has ${p.version(fromPath)?.trim() ?? "an unreadable node"})` : "";
  throw new Error(`The local Convex backend needs Node.js ${SUPPORTED_NODE.join(", ")}${found}. ${installHint(p.platform)}`);
}
