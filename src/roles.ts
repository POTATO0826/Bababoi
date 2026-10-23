// Jarvis per role: what it greets you with and what it suggests. Counts come from the live ledger.
import type { Role } from "@/domain/types";
import type { Stage } from "@/store";

type Counts = Partial<Record<Stage, number>>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function greeting(role: Role, name: string, c: Counts): string {
  const parts =
    role === "owner"
      ? [c.approve && plural(c.approve, "approval"), c.ageing && plural(c.ageing, "ageing batch", "ageing batches"), c.replenish && plural(c.replenish, "reorder")]
      : role === "sales"
        ? [c.deals && plural(c.deals, "deal") + " to work", c.delivery && plural(c.delivery, "deal") + " need quotes"]
        : [c.receive && plural(c.receive, "delivery note") + " to verify", c.collect && plural(c.collect, "pickup")];
  const todo = parts.filter(Boolean).join(" · ");
  return todo ? `${name}, ${todo}.` : `${name}, nothing waiting on you.`;
}

export const SUGGESTIONS: Record<Role, string[]> = {
  owner: ["What needs my approval?", "有什么旧货？", "What should I reorder?"],
  sales: ["Which old stock can I sell?", "Get delivery quotes for the sofa deal", "Show my deals"],
  warehouse: ["What do I need to verify?", "Anything to collect today?", "Where are the oak dining chairs?"],
};
