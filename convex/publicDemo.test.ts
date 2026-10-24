/// <reference types="vite/client" />
// Public demo sign-in: the token exists only on the listed demo deployment, and it opens only that deployment's demo owner.
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { generateDemoKeys } from "../src/local/demo-identity";
import { PUBLIC_DEMO_AUDIENCE, PUBLIC_DEMO_DEPLOYMENTS, PUBLIC_DEMO_ISSUER, PUBLIC_DEMO_VISITOR, publicDemoTokenIdentifier } from "../src/domain/local-demo";

const modules = import.meta.glob("./**/*.ts");
const demoUrl = `https://${PUBLIC_DEMO_DEPLOYMENTS[0]}.convex.cloud`;

afterEach(() => { vi.unstubAllEnvs(); });

async function deployment(cloudUrl: string) {
  const keys = await generateDemoKeys();
  vi.stubEnv("CONVEX_CLOUD_URL", cloudUrl);
  vi.stubEnv("WAREORB_PUBLIC_DEMO_JWKS", keys.jwksDataUri);
  vi.stubEnv("WAREORB_PUBLIC_DEMO_PRIVATE_JWK", keys.privateJwk);
  return convexTest(schema, modules);
}
const claims = (token: string) => JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;

describe("public demo token", () => {
  it("does not exist on any other deployment, even with the demo keys set", async () => {
    for (const url of ["https://descriptive-lemur-152.convex.cloud", "https://admired-swordfish-390.convex.cloud", "https://quiet-otter-123.convex.cloud", "http://127.0.0.1:3210"]) {
      const t = await deployment(url);
      expect((await t.fetch("/demo/token", { method: "POST" })).status).toBe(404);
    }
  });

  it("does not exist on the demo deployment until its keys are set", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", demoUrl);
    const t = convexTest(schema, modules);
    expect((await t.fetch("/demo/token", { method: "POST" })).status).toBe(404);
  });

  it("signs the visitor in as the demo identity on the demo deployment", async () => {
    const t = await deployment(demoUrl);
    const res = await t.fetch("/demo/token", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const { token, expiresAt } = (await res.json()) as { token: string; expiresAt: number };
    expect(claims(token)).toMatchObject({ iss: PUBLIC_DEMO_ISSUER, aud: PUBLIC_DEMO_AUDIENCE, sub: PUBLIC_DEMO_VISITOR.subject });
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it("gives the visitor owner access only after the owner is provisioned", async () => {
    const t = await deployment(demoUrl);
    const tokenIdentifier = publicDemoTokenIdentifier(PUBLIC_DEMO_VISITOR.subject);
    const visitor = t.withIdentity({ tokenIdentifier, issuer: PUBLIC_DEMO_ISSUER, subject: PUBLIC_DEMO_VISITOR.subject });
    expect(await visitor.query(api.access.me, {})).toBeNull();
    await t.mutation(internal.access.bootstrapOwner, { tokenIdentifier, email: PUBLIC_DEMO_VISITOR.email, name: PUBLIC_DEMO_VISITOR.name });
    expect(await visitor.query(api.access.me, {})).toMatchObject({ role: "owner", name: PUBLIC_DEMO_VISITOR.name });
  });
});
