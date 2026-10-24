import { describe, expect, test } from "bun:test";
import { agentCommandOf, agentCommands, commandsFor, looksLikeSecret, rankCommands } from "../commands";

const ids = (typed: string, role: "owner" | "sales" | "warehouse" = "owner", connected = false) => rankCommands([...agentCommands(connected), ...commandsFor(role)], typed).map((c) => c.id);

describe("slash-menu ranking", () => {
  test("/delivery: the exact command is first even though Receive's keyword 'delivery note' matches", () => {
    expect(ids("delivery")).toEqual(["delivery", "receive"]);
    expect(ids("DELIVERY")[0]).toBe("delivery");
  });
  test("partial text still suggests by prefix, then label, then keywords; menu order breaks ties", () => {
    expect(ids("de")).toEqual(["deals", "delivery", "login", "receive", "replenish"]); // "Claude" label, "delivery note"/"reorder" keywords
    expect(ids("re")).toEqual(["receive", "replenish", "approve"]);
    expect(ids("quote")).toEqual(["delivery"]);
    expect(ids("")).toEqual(["login", "receive", "ageing", "deals", "delivery", "approve", "collect", "replenish"]);
  });
  test("role restrictions and /login, /logout are kept", () => {
    expect(ids("approve", "sales")).toEqual([]);
    expect(ids("log", "owner", true)).toEqual(["logout", "login"]);
    expect(ids("login")[0]).toBe("login");
    expect(agentCommandOf("/delivery")).toBeNull();
  });
  test("Lalamove keys pasted into chat are treated as secrets", () => {
    expect(looksLikeSecret("pk_test_0123456789abcdef0123456789abcdef")).toBe(true);
    expect(looksLikeSecret("sk_test_0123456789abcdef0123456789abcdef")).toBe(true);
    expect(looksLikeSecret("/delivery")).toBe(false);
  });
});
