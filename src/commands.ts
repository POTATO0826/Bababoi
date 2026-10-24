// Slash commands: the only way into the workflow panels (palette, Jarvis or keyboard). The map stays the default view.
import {
  ArchiveRestoreIcon,
  ClockIcon,
  HandshakeIcon,
  KeyRoundIcon,
  LogOutIcon,
  PackageCheckIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  TruckIcon,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/domain/types";
import { getWare, setWare, type Stage } from "@/store";

export type CommandId = Exclude<Stage, "inventory">;

export interface Command {
  id: CommandId;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  keywords: string[];
}

export const COMMANDS: Command[] = [
  { id: "receive", label: "Receive", icon: ScanLineIcon, roles: ["warehouse", "owner", "sales"], keywords: ["delivery note", "receipt", "入库", "收货"] },
  { id: "ageing", label: "Ageing stock", icon: ClockIcon, roles: ["owner", "sales"], keywords: ["old", "unsold", "slow", "旧货", "清货"] },
  { id: "deals", label: "Deals", icon: HandshakeIcon, roles: ["sales", "owner", "warehouse"], keywords: ["buyer", "offer", "sell", "买家"] },
  { id: "delivery", label: "Delivery quotes", icon: TruckIcon, roles: ["sales", "owner"], keywords: ["lalamove", "quote", "lorry", "运费", "报价"] },
  { id: "approve", label: "Approvals", icon: ShieldCheckIcon, roles: ["owner"], keywords: ["approve", "review", "审核"] },
  { id: "collect", label: "Collection", icon: PackageCheckIcon, roles: ["warehouse", "owner"], keywords: ["dispatch", "pickup", "出货", "发货"] },
  { id: "replenish", label: "Replenish", icon: ArchiveRestoreIcon, roles: ["owner"], keywords: ["reorder", "purchase", "restock", "进货", "补货"] },
];

export const commandsFor = (role: Role) => COMMANDS.filter((c) => c.roles.includes(role));

/** Local demo: connecting the AI provider. Not warehouse panels, and never sent to a model. */
export type AgentCommandId = "login" | "logout";
export interface AgentCommand {
  id: AgentCommandId;
  label: string;
  icon: LucideIcon;
  keywords: string[];
  /** Offered only once typed: a bare "/" + Enter must never disconnect Jarvis. */
  explicit?: boolean;
}

export function agentCommands(connected: boolean): AgentCommand[] {
  const login: AgentCommand = { id: "login", label: connected ? "Switch Jarvis's Claude API key" : "Connect Jarvis with a Claude API key", icon: KeyRoundIcon, keywords: ["login", "connect", "api key", "claude", "sign in", "登录"] };
  const logout: AgentCommand = { id: "logout", label: "Log Jarvis out (disconnect Claude)", icon: LogOutIcon, keywords: ["logout", "disconnect", "sign out", "退出"], explicit: true };
  return connected ? [logout, login] : [login];
}

/** The "/" menu: warehouse panels first, then connecting Jarvis (local demo). */
export const slashMenu = (role: Role, agent: AgentCommand[] = []) => [...commandsFor(role), ...agent];

/** "/login …" or "/logout …" typed or spoken into Jarvis. */
export function agentCommandOf(text: string): AgentCommandId | null {
  const m = text.trim().match(/^\/(login|logout)(?:\s|$)/i);
  return m ? (m[1]!.toLowerCase() as AgentCommandId) : null;
}

/** Text that looks like an API key or token: never recorded in chat or sent to a model. */
export const looksLikeSecret = (text: string) => /sk-ant-[A-Za-z0-9_-]{8,}|\bsk-[A-Za-z0-9_-]{24,}|\b(sk|pk)_(live|test)_[A-Za-z0-9]{10,}/.test(text);

/**
 * Slash-menu suggestions for what was typed after "/". An exact command id wins, then ids and labels that start
 * with the text, then any other match (including keywords); ties keep the menu's own order.
 */
export function rankCommands<T extends { id: string; label: string; keywords: readonly string[]; explicit?: boolean }>(items: readonly T[], typed: string): T[] {
  const q = typed.trim().toLowerCase();
  const score = (c: T) => {
    const id = c.id.toLowerCase(), label = c.label.toLowerCase();
    if (!q) return c.explicit ? -1 : 3;
    if (id === q) return 0;
    if (id.startsWith(q)) return 1;
    if (label.startsWith(q)) return 2;
    if (id.includes(q) || label.includes(q)) return 3;
    if (c.keywords.some((k) => k.toLowerCase().includes(q))) return 4;
    return -1;
  };
  return items.map((c, i) => ({ c, i, s: score(c) })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.c);
}

export const commandById = (id: string) => COMMANDS.find((c) => c.id === id);

/** Open a command's panel. Commands only navigate — they never approve, post or dispatch. */
export function openCommand(id: CommandId) {
  const { detail } = getWare();
  // /delivery with a deal already open keeps that deal in view.
  const keep = id === "delivery" && detail?.kind === "deal" ? detail : null;
  setWare({ stage: id, detail: keep, panelOpen: false });
}

/** Esc / done: back to just the map. */
export function closePanel() {
  setWare({ stage: "inventory", detail: null });
}
