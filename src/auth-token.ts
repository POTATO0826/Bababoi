/** Clerk's Convex JWT is supplied by the mounted authenticated app. */
let getToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(provider: typeof getToken) {
  getToken = provider;
}

export async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getToken?.();
  return token ? { Authorization: `Bearer ${token}` } : null;
}
