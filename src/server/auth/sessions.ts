import type { SessionUser } from "@/shared/contracts";
import { userById } from "./users";

export const SESSION_COOKIE = "wareorb_session";
const MAX_AGE_SECONDS = 12 * 60 * 60;

/**
 * Opaque demo sessions held in process memory. A server restart requires choosing a persona again;
 * business records stay in SQLite. The cookie carries no role: the server maps it to a configured user.
 */
export class SessionStore {
  private readonly sessions = new Map<string, { userId: string; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  create(userId: string): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Buffer.from(bytes).toString("base64url");
    this.sessions.set(token, { userId, expiresAt: this.now() + MAX_AGE_SECONDS * 1000 });
    return token;
  }

  resolve(token: string | null): SessionUser | null {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expiresAt < this.now()) {
      this.sessions.delete(token);
      return null;
    }
    return userById(s.userId);
  }

  delete(token: string | null) {
    if (token) this.sessions.delete(token);
  }
}

export function readSessionToken(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function isHttps(req: Request) {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export function sessionCookie(token: string, secure: boolean) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
