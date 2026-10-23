import { afterEach, expect, test } from "bun:test";
import { DEMO_USERS } from "@/server/auth/users";
import { bootstrap, signIn, useServerData } from "@/server-data";
import { snapshot, tempDb } from "./helpers";

const originalFetch = globalThis.fetch;
const initialState = useServerData.getState();
afterEach(() => {
  globalThis.fetch = originalFetch;
  useServerData.setState(initialState, true);
});

test("a fresh page with a valid session loads all demo personas and can switch roles", async () => {
  const t = tempDb();
  try {
    useServerData.setState({ ...initialState, session: null, personas: [], auth: "unknown", inventory: null }, true);
    const requests: string[] = [];
    globalThis.fetch = (async (input, init) => {
      const path = String(input);
      requests.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/session") return Response.json({ data: { user: DEMO_USERS[1], demo: true } });
      if (path === "/api/warehouse") return Response.json({ data: snapshot(t.db) });
      if (path === "/api/demo/personas") return Response.json({ data: { personas: DEMO_USERS } });
      if (path === "/api/demo/session" && init?.method === "POST") {
        const { userId } = JSON.parse(String(init.body)) as { userId: string };
        return Response.json({ data: { user: DEMO_USERS.find((p) => p.id === userId), demo: true } });
      }
      return Response.json({ error: { code: "not_found", message: path } }, { status: 404 });
    }) as typeof fetch;

    await bootstrap();
    expect(useServerData.getState().auth).toBe("signed-in");
    expect(useServerData.getState().session?.user.role).toBe("warehouse");
    expect(useServerData.getState().personas.map((p) => p.role)).toEqual(["owner", "warehouse", "sales"]);
    expect(requests).toContain("GET /api/demo/personas");

    await signIn(DEMO_USERS[2]!.id);
    expect(useServerData.getState().session?.user.role).toBe("sales");
  } finally {
    t.cleanup();
  }
});
