import { describe, expect, test } from "bun:test";
import { findConvexNode, type NodeProbe } from "./node-runtime";

function probe(platform: string, nodes: Record<string, string>, opts: { env?: Record<string, string>; path?: string; dirs?: Record<string, string[]> } = {}): NodeProbe {
  return {
    env: opts.env ?? {}, platform, home: "/home/p",
    which: () => opts.path ?? null,
    exists: (p) => p in nodes,
    isDir: (p) => p in (opts.dirs ?? {}) || p === "/custom",
    listDir: (p) => opts.dirs?.[p] ?? [],
    version: (bin) => nodes[bin] ?? null,
  };
}

describe("Node.js for the local Convex backend", () => {
  test("uses PATH when it is supported", () => {
    expect(findConvexNode(probe("linux", { "/usr/local/bin/node": "v22.22.0\n" }, { path: "/usr/local/bin/node" }))).toBe("/usr/local/bin");
  });

  test("Linux: skips an unsupported PATH node and finds /opt or nvm versions", () => {
    expect(findConvexNode(probe("linux", { "/usr/bin/node": "v26.1.0", "/opt/node22/bin/node": "v22.22.0" }, { path: "/usr/bin/node" }))).toBe("/opt/node22/bin");
    expect(findConvexNode(probe("linux", { "/usr/bin/node": "v26.1.0", "/home/p/.nvm/versions/node/v24.3.0/bin/node": "v24.3.0" }, { path: "/usr/bin/node", dirs: { "/home/p/.nvm/versions/node": ["v18.0.0", "v24.3.0"] } }))).toBe("/home/p/.nvm/versions/node/v24.3.0/bin");
  });

  test("Mac: keeps the Homebrew keg-only path", () => {
    expect(findConvexNode(probe("darwin", { "/opt/homebrew/bin/node": "v26.0.0", "/opt/homebrew/opt/node@24/bin/node": "v24.9.0" }, { path: "/opt/homebrew/bin/node" }))).toBe("/opt/homebrew/opt/node@24/bin");
  });

  test("WAREORB_CONVEX_NODE wins and is checked", () => {
    expect(findConvexNode(probe("linux", { "/custom/node": "v20.19.0" }, { env: { WAREORB_CONVEX_NODE: "/custom" } }))).toBe("/custom");
    expect(() => findConvexNode(probe("linux", { "/custom/node": "v26.0.0" }, { env: { WAREORB_CONVEX_NODE: "/custom/node" } }))).toThrow(/Node.js v26.0.0.*needs Node.js 20, 22, 24/);
  });

  test("platform-specific instructions when nothing fits", () => {
    expect(() => findConvexNode(probe("linux", { "/usr/bin/node": "v26.0.0" }, { path: "/usr/bin/node" }))).toThrow(/PATH has v26\.0\.0.*nvm install 24.*WAREORB_CONVEX_NODE/);
    expect(() => findConvexNode(probe("darwin", {}))).toThrow(/brew install node@24/);
  });

  test("Windows: uses node.exe from PATH, including a path containing spaces", () => {
    const bin = "C:\\Program Files\\nodejs\\node.exe";
    expect(findConvexNode(probe("win32", { [bin]: "v24.10.0" }, { path: bin }))).toBe("C:\\Program Files\\nodejs");
  });

  test("Windows: accepts an explicit node.exe or its directory", () => {
    const bin = "D:\\Tools\\Node 24\\node.exe";
    for (const selected of [bin, "D:\\Tools\\Node 24"]) {
      expect(findConvexNode(probe("win32", { [bin]: "v24.10.0" }, {
        env: { WAREORB_CONVEX_NODE: selected }, dirs: { "D:\\Tools\\Node 24": [] },
      }))).toBe("D:\\Tools\\Node 24");
    }
  });

  test("Windows: finds the supported installation after an unsupported PATH version", () => {
    const current = "C:\\Tools\\node\\node.exe";
    const supported = "C:\\Program Files\\nodejs\\node.exe";
    expect(findConvexNode(probe("win32", { [current]: "v26.0.0", [supported]: "v24.10.0" }, {
      path: current, env: { ProgramFiles: "C:\\Program Files" },
    }))).toBe("C:\\Program Files\\nodejs");
  });
});
