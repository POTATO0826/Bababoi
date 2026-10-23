// Reactive server-data slice, kept separate from camera/selection state in store.ts.
// One normalized snapshot at a time, replaced atomically; older revisions and out-of-order responses
// are discarded. On failure the last snapshot stays visible but is marked stale — never replaced by seed data.
import { create } from "zustand";
import { ApiError, api } from "@/lib/api";
import { GeometryMismatchError, buildInventory, type Inventory } from "@/lib/inventory";
import type { SessionInfo, SessionUser, WarehouseSnapshot } from "@/shared/contracts";

export type AuthState = "unknown" | "signed-in" | "anonymous" | "disabled";

export interface ServerDataState {
  /** loading: no snapshot yet · ready: have a snapshot · error: no snapshot and the last read failed. */
  status: "loading" | "ready" | "error";
  /** A snapshot is shown but the latest refresh failed. Stock-changing confirmations are disabled. */
  stale: boolean;
  error: string | null;
  inventory: Inventory | null;
  /** Server time of the last successful read (may advance without a new revision). */
  syncedAt: string | null;
  auth: AuthState;
  session: SessionInfo | null;
  personas: SessionUser[];
  /** Increments whenever the revision changes so movement/history caches refetch. */
  historyEpoch: number;
}

export const useServerData = create<ServerDataState>()(() => ({
  status: "loading",
  stale: false,
  error: null,
  inventory: null,
  syncedAt: null,
  auth: "unknown",
  session: null,
  personas: [],
  historyEpoch: 0,
}));

const set = useServerData.setState;
export const getServerData = useServerData.getState;
export const getInventory = () => getServerData().inventory;
export const useInventory = () => useServerData((s) => s.inventory);
export const useRole = () => useServerData((s) => s.session?.user.role ?? null);

let requestSeq = 0;
let appliedSeq = 0;

function failed(message: string) {
  set((s) => ({ stale: !!s.inventory, status: s.inventory ? "ready" : "error", error: message }));
}

/** Fetches the warehouse snapshot. Resolves to the inventory now in the store (fresh or, on failure, stale). */
export async function refreshSnapshot(): Promise<{ ok: boolean; inventory: Inventory | null }> {
  if (getServerData().auth !== "signed-in") return { ok: false, inventory: getInventory() };
  const seq = ++requestSeq;
  try {
    const res = await api<WarehouseSnapshot>("GET", "/warehouse");
    if (seq < appliedSeq) return { ok: true, inventory: getInventory() }; // a newer response already landed
    appliedSeq = seq;
    const cur = getInventory();
    if (cur && res.data.revision < cur.revision) return { ok: true, inventory: cur }; // never go back in time
    if (cur && res.data.revision === cur.revision) {
      set({ stale: false, error: null, status: "ready", syncedAt: res.data.asOf });
      return { ok: true, inventory: cur };
    }
    const inventory = buildInventory(res.data);
    set((s) => ({ inventory, status: "ready", stale: false, error: null, syncedAt: res.data.asOf, historyEpoch: s.historyEpoch + 1 }));
    return { ok: true, inventory };
  } catch (e) {
    if (seq < appliedSeq) return { ok: false, inventory: getInventory() };
    if (e instanceof ApiError && e.status === 401) {
      set({ auth: "anonymous", session: null });
      failed("Session ended — choose a demo persona again.");
      void loadPersonas();
    } else if (e instanceof GeometryMismatchError) failed(e.message);
    else failed(e instanceof Error ? e.message : "The stock ledger could not be read.");
    return { ok: false, inventory: getInventory() };
  }
}

async function loadPersonas() {
  try {
    const res = await api<{ personas: SessionUser[] }>("GET", "/demo/personas");
    set({ personas: res.data.personas, auth: getServerData().session ? "signed-in" : "anonymous" });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404)
      set({ auth: getServerData().session ? "signed-in" : "disabled", personas: [] });
    else failed(e instanceof Error ? e.message : "The server cannot be reached.");
  }
}

export async function bootstrap() {
  try {
    const res = await api<SessionInfo>("GET", "/session");
    set({ session: res.data, auth: "signed-in" });
    await Promise.all([refreshSnapshot(), loadPersonas()]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      set({ auth: "anonymous", session: null, status: getInventory() ? "ready" : "loading" });
      await loadPersonas();
    } else failed(e instanceof Error ? e.message : "The server cannot be reached.");
  }
}

export async function signIn(userId: string) {
  const res = await api<SessionInfo>("POST", "/demo/session", { userId });
  set({ session: res.data, auth: "signed-in", error: null });
  await refreshSnapshot();
}

export async function signOut() {
  try {
    await api("DELETE", "/session");
  } finally {
    set({ session: null, auth: "anonymous" });
    void loadPersonas();
  }
}

const POLL_MS = 15_000;

/** Initial load, focus/visibility refresh and ~15 s polling while visible. Returns a stop function. */
export function startSync(): () => void {
  void bootstrap();
  const onVisible = () => {
    if (document.visibilityState === "visible") void refreshSnapshot();
  };
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") void refreshSnapshot();
  }, POLL_MS);
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** Whether stock-changing confirmations may be offered right now. */
export const canConfirmStock = (s: ServerDataState) => s.status === "ready" && !s.stale && s.auth === "signed-in";
