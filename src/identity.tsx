// Who is signed in, independent of the sign-in system: Clerk staff accounts in production,
// or the presenter on this machine in local demo mode (`bun run demo`).
import { useAuth, useClerk, useUser } from "@clerk/react";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

export const localDemo = process.env.BUN_PUBLIC_WAREORB_LOCAL_DEMO === "1";

export interface Identity {
  mode: "clerk" | "local-demo";
  email: string | null;
  signOut: (() => unknown) | null;
  /** Convex token for authenticated HTTP endpoints such as voice. */
  getToken: () => Promise<string | null>;
}

const IdentityContext = createContext<Identity | null>(null);

export function useIdentity(): Identity {
  const identity = useContext(IdentityContext);
  if (!identity) throw new Error("Identity provider missing");
  return identity;
}

export function ClerkIdentity({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const { getToken, sessionClaims } = useAuth();
  const { user } = useUser();
  // Clerk's Convex integration puts aud "convex" on the session token; older apps use a "convex" JWT template.
  const nativeConvexToken = sessionClaims?.aud === "convex";
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const value = useMemo<Identity>(() => ({
    mode: "clerk",
    email,
    signOut: () => signOut(),
    getToken: () => (nativeConvexToken ? getToken() : getToken({ template: "convex" })),
  }), [email, getToken, nativeConvexToken, signOut]);
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

let demoCache: { token: string; expiresAt: number } | null = null;

/** The presenter's token, minted by the local WareOrb server (never by the browser). */
async function demoToken(force = false): Promise<string | null> {
  if (!force && demoCache && demoCache.expiresAt - Date.now() > 60_000) return demoCache.token;
  try {
    const res = await fetch("/api/demo/token", { cache: "no-store" });
    if (!res.ok) return null;
    demoCache = (await res.json()) as { token: string; expiresAt: number };
    return demoCache.token;
  } catch {
    return null;
  }
}

/** Convex auth for local demo mode: always signed in as the presenter while the local server runs. */
export function useDemoConvexAuth() {
  const fetchAccessToken = useCallback(({ forceRefreshToken }: { forceRefreshToken: boolean }) => demoToken(forceRefreshToken), []);
  return useMemo(() => ({ isLoading: false, isAuthenticated: true, fetchAccessToken }), [fetchAccessToken]);
}

const DEMO: Identity = { mode: "local-demo", email: null, signOut: null, getToken: () => demoToken() };

export function DemoIdentity({ children }: { children: ReactNode }) {
  return <IdentityContext.Provider value={DEMO}>{children}</IdentityContext.Provider>;
}
