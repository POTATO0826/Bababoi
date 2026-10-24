/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ownerToken = "https://clerk.example|owner-user";
const salesToken = "https://clerk.example|sales-user";
const ownerIdentity = { issuer: "https://clerk.example", subject: "owner-user", tokenIdentifier: ownerToken };
const salesIdentity = { issuer: "https://clerk.example", subject: "sales-user", tokenIdentifier: salesToken };
const claimedOwner = { role: "owner" as const, name: "Impersonated Owner" };
const fakePurchase = { actor: claimedOwner, skuCode: "X", qty: 1, rationale: "", supplier: "Test", orderRef: "TEST-1", confirmedAt: 1, unitCostSen: 100, confirmed: true };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function provisionOwner() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.access.bootstrapOwner, { tokenIdentifier: ownerToken, email: "owner@example.com", name: "Real Owner" });
  return { t, owner: t.withIdentity(ownerIdentity) };
}

describe("staff authorization", () => {
  it("keeps inventory and writes private before authentication", async () => {
    const { t } = await provisionOwner();
    await expect(t.query(api.ledger.snapshot, { since: 0 })).rejects.toThrow();
    await expect(t.mutation(api.replenish.createPO, fakePurchase)).rejects.toThrow("Sign in required");
    await expect(t.mutation(api.receiving.generateUploadUrl, { actor: claimedOwner })).rejects.toThrow();
    await expect(t.action(api.lalamove.services, {})).rejects.toThrow();
    await expect(t.fetch("/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Hello" }) })).rejects.toThrow();
    expect(await t.query(api.access.me, {})).toBeNull();
    expect(await t.query(api.access.bootstrapIdentity, {})).toBeNull();
  });

  it("ignores supplied owner identity and revokes inactive staff immediately", async () => {
    const { t, owner } = await provisionOwner();
    const staffId = await owner.mutation(api.access.inviteStaff, { email: "sales@example.com", name: "Sales One", role: "sales" });
    const sales = t.withIdentity(salesIdentity);
    expect(await sales.query(api.access.me, {})).toBeNull();
    await t.mutation(internal.access.bindInvitation, { tokenIdentifier: salesToken, verifiedEmails: ["sales@example.com"] });
    expect((await sales.query(api.access.me, {}))?.role).toBe("sales");
    await expect(sales.mutation(api.replenish.createPO, fakePurchase)).rejects.toThrow("owner only");
    await owner.mutation(api.access.updateStaff, { staffId, active: false });
    expect(await sales.query(api.access.me, {})).toBeNull();
    await expect(sales.query(api.ledger.snapshot, { since: 0 })).rejects.toThrow();
  });

  it("does not match another email and preserves the last active owner", async () => {
    const { t, owner } = await provisionOwner();
    const ownerStaff = (await owner.query(api.access.listStaff, {}))[0]!;
    await expect(owner.mutation(api.access.updateStaff, { staffId: ownerStaff._id, active: false })).rejects.toThrow();
    await expect(owner.mutation(api.access.updateStaff, { staffId: ownerStaff._id, role: "sales" })).rejects.toThrow();
    const staffId = await owner.mutation(api.access.inviteStaff, { email: "sales@example.com", name: "Sales One", role: "sales" });
    expect(await t.mutation(internal.access.bindInvitation, { tokenIdentifier: salesToken, verifiedEmails: ["other@example.com"] })).toBeNull();
    expect((await owner.query(api.access.listStaff, {})).find((s) => s._id === staffId)?.status).toBe("invited");
  });

  it("permits an owner handoff after a second owner is active", async () => {
    const { t, owner } = await provisionOwner();
    const first = (await owner.query(api.access.listStaff, {}))[0]!;
    const secondId = await owner.mutation(api.access.inviteStaff, { email: "sales@example.com", name: "Second", role: "sales" });
    await t.mutation(internal.access.bindInvitation, { tokenIdentifier: salesToken, verifiedEmails: ["sales@example.com"] });
    await owner.mutation(api.access.updateStaff, { staffId: secondId, role: "owner" });
    await owner.mutation(api.access.updateStaff, { staffId: first._id, active: false });
    expect(await owner.query(api.access.me, {})).toBeNull();
    expect((await t.withIdentity(salesIdentity).query(api.access.me, {}))?.role).toBe("owner");
    await expect(t.withIdentity(salesIdentity).mutation(api.access.updateStaff, { staffId: secondId, active: false })).rejects.toThrow("Keep at least one active owner");
  });

  it("carries authenticated staff identity into protected actions", async () => {
    const { owner } = await provisionOwner();
    const vehicles = await owner.action(api.lalamove.services, {});
    expect(vehicles.services.length).toBeGreaterThan(0);
  });

  it("reveals only the signed-in caller's exact bootstrap identity", async () => {
    const t = convexTest(schema, modules);
    const candidate = await t.withIdentity({ ...ownerIdentity, email: "owner@example.com", emailVerified: true })
      .query(api.access.bootstrapIdentity, {});
    expect(candidate).toEqual({ ...ownerIdentity, email: "owner@example.com", emailVerified: true });
    expect(await t.query(api.access.bootstrapIdentity, {})).toBeNull();
  });

  it("binds an invitation only after Clerk confirms a verified address", async () => {
    const { t, owner } = await provisionOwner();
    await owner.mutation(api.access.inviteStaff, { email: "sales@example.com", name: "Sales One", role: "sales" });
    const sales = t.withIdentity(salesIdentity);
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://clerk.example");
    vi.stubEnv("CLERK_SECRET_KEY", "test-only-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      id: "sales-user", banned: false,
      email_addresses: [{ email_address: "sales@example.com", verification: { status: "unverified" } }],
    }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(sales.action(api.access.activate, {})).rejects.toThrow("Verify your email");
    expect(await sales.query(api.access.me, {})).toBeNull();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({
      id: "sales-user", banned: false,
      email_addresses: [{ email_address: "sales@example.com", verification: { status: "verified" } }],
    }) });
    expect((await sales.action(api.access.activate, {}))?.role).toBe("sales");
    expect((await sales.query(api.access.me, {}))?.active).toBe(true);
  });

  it("initializes only settings, with demo mode disabled", async () => {
    const { t, owner } = await provisionOwner();
    await owner.mutation(api.access.ensureBusinessSettings, {});
    const rows = await t.run(async (ctx) => ({
      settings: await ctx.db.query("settings").take(2),
      skus: await ctx.db.query("skus").take(1),
      batches: await ctx.db.query("batches").take(1),
      receipts: await ctx.db.query("receipts").take(1),
    }));
    expect(rows.settings).toHaveLength(1);
    expect(rows.settings[0]?.demoMode).toBe(false);
    expect(rows.skus).toHaveLength(0);
    expect(rows.batches).toHaveLength(0);
    expect(rows.receipts).toHaveLength(0);
    await expect(t.mutation(api.seed.ensure, {})).rejects.toThrow();
    await owner.mutation(api.seed.ensure, {});
    expect(await t.run(async (ctx) => ctx.db.query("skus").take(1))).toHaveLength(0);
    await expect(t.mutation(internal.seed.run, {})).rejects.toThrow("Demo data is disabled");
    expect(await t.run(async (ctx) => ctx.db.query("settings").take(2))).toHaveLength(1);
  });

  it("lets the owner cancel and reissue an unbound invitation without granting access", async () => {
    const { t, owner } = await provisionOwner();
    const staffId = await owner.mutation(api.access.inviteStaff, { email: "sales@example.com", name: "Sales", role: "sales" });
    await owner.mutation(api.access.updateStaff, { staffId, active: false });
    expect(await t.mutation(internal.access.bindInvitation, { tokenIdentifier: salesToken, verifiedEmails: ["sales@example.com"] })).toBeNull();
    const invited = await owner.mutation(api.access.updateStaff, { staffId, active: true });
    expect(invited.status).toBe("invited"); expect(invited.active).toBe(false);
    expect(await t.withIdentity(salesIdentity).query(api.access.me, {})).toBeNull();
    expect((await t.mutation(internal.access.bindInvitation, { tokenIdentifier: salesToken, verifiedEmails: ["sales@example.com"] }))?.active).toBe(true);
  });
});
