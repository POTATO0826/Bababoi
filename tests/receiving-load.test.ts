import { describe, expect, test } from "bun:test";
import { receiptLoadDecision } from "@/components/receiving/load-policy";

const decide = (overrides: Partial<Parameters<typeof receiptLoadDecision>[0]> = {}) =>
  receiptLoadDecision({ currentVersion: 1, incomingVersion: 1, dirty: false, force: false, requestGeneration: 4, currentGeneration: 4, ...overrides });

describe("receiving background reads", () => {
  test("an unrelated revision preserves local edits and their dirty state", () => {
    expect(decide({ dirty: true })).toBe("preserve");
  });

  test("a changed receipt keeps local edits and reports a conflict", () => {
    expect(decide({ dirty: true, incomingVersion: 2 })).toBe("conflict");
    expect(decide({ dirty: true, incomingVersion: 2, force: true })).toBe("apply");
  });

  test("responses started before an edit, save or newer read are obsolete", () => {
    expect(decide({ requestGeneration: 3 })).toBe("discard");
    expect(decide({ requestGeneration: 3, dirty: true, incomingVersion: 2, force: true })).toBe("discard");
  });
});
