import { SignInButton } from "@clerk/react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { openAgent } from "@/actions";
import { closePanel } from "@/commands";
import { Header } from "@/components/header";
import { LedgerSync } from "@/components/ledger-sync";
import { StageColumn } from "@/components/stages/stage-column";
import { ReceiveDialog } from "@/components/inventory/receive-dialog";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import { Viewport } from "@/components/viewport/viewport";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLayoutTier } from "@/hooks/use-layout";
import { cn } from "@/lib/utils";
import { getWare, setIdentity, useWare, type StaffProfile } from "@/store";
import { Button } from "@/components/ui/button";
import { WarehouseIcon } from "@/components/common";
import { errorText, interimIdentity } from "@/convex";
import { setAuthTokenProvider } from "@/auth-token";
import { useIdentity } from "@/identity";

// Body grid per docs/design-handoff.md → Layout. `stacked` (<720px) is an addition for phones.
const COLUMNS = {
  wide: { base: "316px minmax(0,1fr)", agent: " 320px" },
  mid: { base: "280px minmax(0,1fr)", agent: " 272px" },
  narrow: { base: "256px minmax(0,1fr)", agent: "" },
  stacked: { base: "minmax(0,1fr)", agent: "" },
} as const;

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
};

/** "/" or Ctrl+K opens Jarvis with "/" typed; Esc closes the open panel and returns to the map. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing(e.target))) {
        e.preventDefault();
        openAgent({ draft: "/" });
      } else if (e.key === "Escape" && !typing(e.target)) {
        const s = getWare();
        if (s.detail || s.stage !== "inventory") closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.access.me, isAuthenticated ? {} : "skip");
  const activate = useAction(api.access.activate);
  const identity = useIdentity();
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setAuthTokenProvider(null);
      return;
    }
    setAuthTokenProvider(identity.getToken);
    return () => setAuthTokenProvider(null);
  }, [identity, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || profile === null) setIdentity(null);
    else if (profile) setIdentity(profile);
  }, [isAuthenticated, profile]);

  if (isLoading || (isAuthenticated && profile === undefined)) {
    return <AccessScreen title="Opening WareOrb" description="Checking your staff access…" />;
  }
  if (identity.mode === "local-demo" && (!isAuthenticated || !profile)) {
    return (
      <AccessScreen title="Local demo is not ready" description="The local WareOrb server could not sign in the presenter. Start everything with `bun run demo` in the project folder, then reload this page." />
    );
  }
  if (!isAuthenticated) {
    return (
      <AccessScreen title="Your warehouse, in view" description="Sign in with your staff account to open the live warehouse.">
        <SignInButton mode="modal"><Button className="w-full">Sign in</Button></SignInButton>
      </AccessScreen>
    );
  }
  if (!profile) {
    return (
      <AccessScreen title="Access pending" description="An owner must invite your verified email address before you can view warehouse records.">
        <p className="mb-4 text-center text-xs text-muted-foreground">Signed in as {identity.email ?? "your account"}</p>
        {activationError && <p role="alert" className="mb-3 text-center text-xs text-destructive">{activationError}</p>}
        <Button className="w-full" disabled={activating} onClick={async () => {
          setActivating(true);
          setActivationError(null);
          try {
            const result = await activate({});
            if (!result) setActivationError("No invitation matches a verified email on this account. Ask the owner to invite you.");
          } catch (e) { setActivationError(errorText(e)); }
          finally { setActivating(false); }
        }}>{activating ? "Checking invitation…" : "Activate invitation"}</Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => void identity.signOut?.()}>Sign out</Button>
      </AccessScreen>
    );
  }
  return <Workspace profile={profile} />;
}

function AccessScreen({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-background p-5">
    <section className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
      <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl border border-border-strong bg-raised-2 text-brand"><WarehouseIcon /></div>
      <h1 className="text-center text-xl font-semibold">{title}</h1>
      <p className="mt-2 mb-6 text-center text-sm text-muted-foreground">{description}</p>
      {interimIdentity && <p className="mb-4 rounded-md border border-warn/40 px-3 py-2 text-center text-xs text-warn">Interim sign-in (Clerk development instance). Not the production launch.</p>}
      {children}
    </section>
  </main>;
}

function Workspace({ profile }: { profile: StaffProfile }) {
  useShortcuts();
  const { tier } = useLayoutTier();
  const agentOpen = useWare((s) => s.agentOpen);
  const drawer = tier === "narrow" || tier === "stacked";
  const fixedRows = tier === "wide" || tier === "mid";
  const cols = COLUMNS[tier];

  return (
    <TooltipProvider delayDuration={300}>
      <LedgerSync owner={profile.role === "owner"} />
      <div className={cn("grid grid-rows-[52px_minmax(0,1fr)]", fixedRows ? "h-screen" : "min-h-screen")}>
        <Header />
        <div
          className="grid min-h-0 gap-3 p-3"
          style={{ gridTemplateColumns: cols.base + (agentOpen && !drawer ? cols.agent : "") }}
        >
          <StageColumn
            wide={tier === "wide"}
            className={cn(tier === "narrow" && "h-[min(560px,calc(100vh-76px))]", tier === "stacked" && "order-2 max-h-[80vh]")}
          />
          <Viewport
            className={cn(
              tier === "narrow" && "h-[min(560px,calc(100vh-76px))]",
              tier === "stacked" && "order-1 h-[min(520px,calc(100vh-140px))]",
            )}
          />
          {agentOpen && <JarvisChat drawer={drawer} />}
        </div>
      </div>
      <ReceiveDialog />
      <Toaster position="bottom-right" theme="dark" />
    </TooltipProvider>
  );
}
