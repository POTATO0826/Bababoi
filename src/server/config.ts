import path from "node:path";

export interface ServerConfig {
  port: number;
  /** SQLite file on persistent disk. Never inside src/ or a public/static directory. */
  databasePath: string;
  /** Explicit labelled demo mode: issues synthetic persona sessions. Off unless DEMO_AUTH=1. */
  demoAuth: boolean;
  production: boolean;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: path.resolve(env.DATABASE_PATH ?? path.join("data", "wareorb.sqlite")),
    demoAuth: env.DEMO_AUTH === "1" || env.DEMO_AUTH === "true",
    production: env.NODE_ENV === "production",
  };
}
