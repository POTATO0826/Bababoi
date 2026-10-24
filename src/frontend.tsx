import "./index.css";
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexProviderWithAuth } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { convex } from "./convex";
import { ClerkIdentity, DemoIdentity, localDemo, publicDemo, useDemoConvexAuth } from "./identity";
import { useWare } from "./store";

const elem = document.getElementById("root")!;
const clerkKey = process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.BUN_PUBLIC_CONVEX_URL;
/** Local demo pages only ever run on this computer against its own backend. */
const demoProblem = localDemo && publicDemo ? "Local demo and public demo modes cannot be combined."
  : localDemo
  ? !["127.0.0.1", "localhost"].includes(location.hostname) ? `This login-free presentation page must be opened at http://127.0.0.1, not ${location.hostname}.`
    : !convexUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(convexUrl) ? "The presentation page is not connected to this computer's local backend. Start it with `bun run demo`."
    : null
  : null;

const app = (
  <StrictMode>
    {demoProblem ? (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-xl font-semibold">Local demo refused</h1>
          <p className="mt-3 text-sm text-muted-foreground">{demoProblem}</p>
        </section>
      </main>
    ) : (localDemo || publicDemo) && convexUrl ? (
      <ConvexProviderWithAuth client={convex} useAuth={useDemoConvexAuth}>
        <DemoIdentity>
          <App />
        </DemoIdentity>
      </ConvexProviderWithAuth>
    ) : clerkKey && convexUrl ? (
      <ClerkProvider publishableKey={clerkKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <ClerkIdentity>
            <App />
          </ClerkIdentity>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    ) : (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-xl font-semibold">WareOrb needs identity setup</h1>
          <p className="mt-3 text-sm text-muted-foreground">Set the Clerk publishable key and Convex deployment URL for this environment before staff can sign in.</p>
          <ul className="mt-4 space-y-2 font-mono text-xs text-foreground">
            {!clerkKey && <li>BUN_PUBLIC_CLERK_PUBLISHABLE_KEY</li>}
            {!convexUrl && <li>BUN_PUBLIC_CONVEX_URL</li>}
          </ul>
        </section>
      </main>
    )}
  </StrictMode>
);

// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
if (import.meta.hot) {
  // Dev only: inspect state from the console with `__ware.getState()`.
  (window as unknown as { __ware: typeof useWare }).__ware = useWare;
  (import.meta.hot.data.root ??= createRoot(elem)).render(app);
} else {
  createRoot(elem).render(app);
}
