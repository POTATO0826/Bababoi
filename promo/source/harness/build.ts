// Bundles the promo harness against an UNMODIFIED WareOrb checkout (branch Vince @ 781687f).
// The harness imports the app's real 3D scene modules (src/scene/*, src/data/*, src/domain/*, src/store.ts)
// read-only. Only `@/actions` is replaced by a stub, because it opens a Convex client and voice I/O that a
// render harness must not touch.
//
//   VINCE_DIR=/path/to/wareorb-vince bun run build.ts        (ENTRY=v3 → src3 → dist3; OUTDIR=… to build elsewhere)
import { existsSync, mkdirSync, cpSync, symlinkSync, lstatSync } from "node:fs";
import path from "node:path";

const HERE = import.meta.dir;
// The app checkout: VINCE_DIR, else the handoff package's export (wareorb-promo/vince), else the repository this
// harness is committed in (branch promo/wareorb-video, where promo/ sits inside the app's own checkout).
const isApp = (d: string) => existsSync(path.join(d, "src/scene/structure.tsx"));
const VINCE = path.resolve(process.env.VINCE_DIR ?? [path.join(HERE, "../../../vince"), path.join(HERE, "../../..")].find(isApp) ?? path.join(HERE, "../../../vince"));
if (!isApp(VINCE)) throw new Error(`VINCE_DIR does not look like the WareOrb repo: ${VINCE}`);

// Share the app's node_modules so three / react / R3F are single instances.
const nm = path.join(HERE, "node_modules");
if (!existsSync(nm)) {
  symlinkSync(path.join(VINCE, "node_modules"), nm);
  // Bun's resolver already cached this folder without node_modules while loading this script, and would walk up to
  // any ancestor node_modules (e.g. the repo checkout's) and bundle a second React / three.js. Build in a fresh process.
  const p = Bun.spawnSync([process.execPath, ...process.argv.slice(1)], { stdio: ["inherit", "inherit", "inherit"], env: process.env });
  process.exit(p.exitCode ?? 1);
} else if (!lstatSync(nm).isSymbolicLink()) throw new Error("harness/node_modules must be a symlink to the app's node_modules");

const exts = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const resolveIn = (base: string) => {
  for (const e of exts) if (existsSync(base + e) && !lstatSync(base + e).isDirectory()) return base + e;
  throw new Error("cannot resolve " + base);
};

const alias: import("bun").BunPlugin = {
  name: "wareorb-alias",
  setup(b) {
    b.onResolve({ filter: /^@\/actions$/ }, () => ({ path: path.join(HERE, "src/stub-actions.ts") }));
    b.onResolve({ filter: /^@\// }, (a) => ({ path: resolveIn(path.join(VINCE, "src", a.path.slice(2))) }));
    b.onResolve({ filter: /^@convex\// }, (a) => ({ path: resolveIn(path.join(VINCE, "convex", a.path.slice(8))) }));
  },
};

const V2 = process.env.ENTRY === "v2";
const V3 = process.env.ENTRY === "v3";
const SRC = V3 ? "src3" : V2 ? "src2" : "src";
// OUTDIR overrides the output folder (e.g. build a new cut while a render is still reading dist3).
const out = process.env.OUTDIR ? path.resolve(process.env.OUTDIR) : path.join(HERE, V3 ? "dist3" : V2 ? "dist2" : "dist");
mkdirSync(out, { recursive: true });
const r = await Bun.build({
  entrypoints: [path.join(HERE, V3 ? "src3/main3.tsx" : V2 ? "src2/main2.tsx" : "src/main.tsx")],
  outdir: out,
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "none",
  plugins: [alias],
  define: { "process.env.NODE_ENV": '"production"', "process.env.BUN_PUBLIC_CONVEX_URL": '""' },
});
if (!r.success) {
  for (const l of r.logs) console.error(l);
  process.exit(1);
}
// Guard: every bundled package must come from the app's node_modules (one React, one three.js). Bun's module comments
// are relative paths; the part before the first /node_modules/ must be the app checkout.
const strays = new Set<string>();
for (const o of r.outputs) {
  const js = await Bun.file(o.path).text();
  for (const m of js.matchAll(/^\/\/ (.*?)\/node_modules\/((?:@[^/]+\/)?[^/]+)/gm)) {
    const root = m[1]!;
    if (path.resolve(process.cwd(), root) !== VINCE && path.resolve(HERE, root) !== VINCE) strays.add(`${root}/node_modules/${m[2]}`);
  }
  // ...and exactly one copy of the singletons (an ESM and a CJS build of three.js would be two instances)
  const distinct = (re: RegExp) => new Set([...js.matchAll(re)].map((m) => m[0])).size;
  if (distinct(/^\/\/ .*\/node_modules\/react\/index\.js$/gm) > 1) strays.add("react (more than one copy)");
  if (distinct(/^\/\/ .*\/node_modules\/three\/build\/three\.(cjs|module\.js)$/gm) > 1) strays.add("three (more than one build)");
}
if (strays.size) {
  console.error(`bundle must use one React and one three.js, all from ${path.join(VINCE, "node_modules")}:\n  ${[...strays].join("\n  ")}`);
  process.exit(1);
}
cpSync(path.join(HERE, "public"), out, { recursive: true });
cpSync(path.join(HERE, SRC, "index.html"), path.join(out, "index.html"));
cpSync(path.join(HERE, SRC, "style.css"), path.join(out, "style.css"));
console.log("built", r.outputs.map((o) => path.relative(HERE, o.path)).join(", "));
