import type { Role, SessionUser } from "@/shared/contracts";

/**
 * Configured SYNTHETIC demo users. This is simulated authentication with real server-side
 * authorization checks — not production identity. Requests never supply their own actor or role.
 */
export const DEMO_USERS: readonly SessionUser[] = [
  { id: "u-owner-aisha", name: "Aisha Rahman", initials: "AR", role: "owner", synthetic: true },
  { id: "u-warehouse-jun", name: "Jun Lim", initials: "JL", role: "warehouse", synthetic: true },
  { id: "u-sales-priya", name: "Priya Nair", initials: "PN", role: "sales", synthetic: true },
];

export const SYSTEM_SEED_ACTOR = { id: "system-demo-seed", name: "Demo seed (synthetic)" } as const;

const BY_ID = new Map(DEMO_USERS.map((u) => [u.id, u]));

export const userById = (id: string) => BY_ID.get(id) ?? null;

export function actorName(id: string): string {
  if (id === SYSTEM_SEED_ACTOR.id) return SYSTEM_SEED_ACTOR.name;
  return BY_ID.get(id)?.name ?? id;
}

/** Who may perform each action. Owner can perform warehouse actions (backend plan §3). */
export const PERMISSIONS = {
  "receiving.create": ["warehouse", "owner"],
  "receiving.edit": ["warehouse", "owner"],
  "receiving.post": ["warehouse", "owner"],
  "receiving.cancel": ["warehouse", "owner"],
  "warehouse.read": ["warehouse", "owner", "sales"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, permission: Permission) => (PERMISSIONS[permission] as readonly Role[]).includes(role);
