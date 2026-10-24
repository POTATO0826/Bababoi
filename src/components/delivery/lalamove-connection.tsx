// Local demo: connect the Lalamove sandbox (Malaysia) from the Delivery screen. The key and secret are typed
// into masked, uncontrolled fields and sent once to this computer's WareOrb server; the browser keeps neither.
import { PlugZapIcon, TruckIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { connectLalamove, disconnectLalamove, fetchLalamoveStatus, testLalamove, type LalamoveStatus } from "@/local/lalamove-client";
import { getWare, setWare, useWare } from "@/store";

/** Bumped by every connect/disconnect: older status answers are ignored. */
let epoch = 0;
const apply = (status: LalamoveStatus) => setWare({ lalamove: { ...status, checkedAt: Date.now() } });

export async function refreshLalamove() {
  const my = epoch;
  const st = await fetchLalamoveStatus();
  if (my === epoch) apply(st);
}

export const openLalamoveConnect = () => setWare({ lalamoveConnectOpen: true });

async function disconnect() {
  ++epoch;
  const r = await disconnectLalamove();
  if (r.ok) { apply(r.status); toast.success("Lalamove disconnected. Quote requests are refused until you connect again."); }
  else toast.error(r.error);
}

async function test() {
  const my = ++epoch;
  const r = await testLalamove();
  if (my !== epoch) return;
  if (r.status) apply(r.status);
  if (r.ok) toast.success(`Lalamove sandbox answered: ${r.status.serviceCount} vehicle types for Malaysia.`);
  else toast.error(r.error);
}

const time = (t?: number) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

/** Connection state, shown where quotes are requested. */
export function LalamoveCard({ compact = false }: { compact?: boolean }) {
  const st = useWare((s) => s.lalamove);
  useEffect(() => { if (!getWare().lalamove) void refreshLalamove(); }, []);
  if (!st) return <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Spinner className="size-3" />Checking Lalamove…</div>;
  if (!st.connected) {
    return (
      <div role="status" aria-label="Lalamove connection" className="flex flex-col gap-1.5 rounded-lg border border-border bg-panel p-3 text-[12px]">
        <span className="flex items-center gap-2"><TruckIcon className="size-3.5 text-muted-foreground" /><Badge variant="warn">Lalamove not connected</Badge><Button size="xs" className="ml-auto" onClick={openLalamoveConnect}>Connect</Button></span>
        {!compact && <span className="text-muted-foreground">Connect your Lalamove <b>sandbox</b> API key and secret (Malaysia) to get real sandbox delivery prices. Quotes only: nothing is booked or charged.</span>}
        {st.reason && !/Enter the sandbox API key/.test(st.reason) && <span className="text-dispatch">{st.reason}</span>}
      </div>
    );
  }
  return (
    <div role="status" aria-label="Lalamove connection" className="flex flex-col gap-1.5 rounded-lg border border-border bg-panel p-3 text-[12px]">
      <span className="flex flex-wrap items-center gap-2">
        <TruckIcon className="size-3.5 text-muted-foreground" />
        <Badge variant="ok">Connected · Lalamove sandbox</Badge>
        <span className="font-mono text-muted-foreground">MY · {st.serviceCount} vehicle types · checked {time(st.lastCheck?.at ?? st.servicesAt)}</span>
      </span>
      {st.lastCheck && !st.lastCheck.ok && <span role="alert" className="text-dispatch">Last check failed: {st.lastCheck.error}</span>}
      <span className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="outline" onClick={() => void test()}><PlugZapIcon data-icon="inline-start" />Test connection</Button>
        <Button size="xs" variant="quiet" onClick={openLalamoveConnect}>Replace keys</Button>
        <Button size="xs" variant="quiet" onClick={() => void disconnect()}>Disconnect</Button>
      </span>
    </div>
  );
}

export function LalamoveConnectDialog() {
  const open = useWare((s) => s.lalamoveConnectOpen);
  const replacing = useWare((s) => s.lalamove?.connected === true);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setWare({ lalamoveConnectOpen: false }); }}>
      <DialogContent className="sm:max-w-[460px]" aria-describedby="lalamove-connect-description">
        {open && <ConnectForm replacing={replacing} />}
      </DialogContent>
    </Dialog>
  );
}

function ConnectForm({ replacing }: { replacing: boolean }) {
  // Uncontrolled fields: the values live only in the inputs (never in React state or a DOM attribute).
  const keyRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [filled, setFilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    keyRef.current?.focus();
    return () => pending.current?.abort();
  }, []);
  const clear = () => { for (const r of [keyRef, secretRef]) if (r.current) r.current.value = ""; setFilled(false); };
  const onInput = () => { setFilled(!!keyRef.current?.value.trim() && !!secretRef.current?.value.trim()); setError(null); };
  const cancel = () => { pending.current?.abort(); clear(); setWare({ lalamoveConnectOpen: false }); void refreshLalamove(); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const key = keyRef.current?.value.trim() ?? "", secret = secretRef.current?.value.trim() ?? "";
    if (!key || !secret) { setError("Enter both the API key and the API secret."); return; }
    setBusy(true); setError(null);
    const abort = new AbortController();
    pending.current = abort;
    const my = ++epoch;
    try {
      const r = await connectLalamove(key, secret, { signal: abort.signal });
      if (abort.signal.aborted || my !== epoch) return;
      if (r.status) apply(r.status);
      if (r.ok) { clear(); setWare({ lalamoveConnectOpen: false }); toast.success(`Connected to the Lalamove sandbox: ${r.status.serviceCount} vehicle types for Malaysia.`); }
      else { setError(r.error); keyRef.current?.focus(); }
    } finally {
      pending.current = null;
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" autoComplete="off">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><TruckIcon className="size-4" />{replacing ? "Replace Lalamove keys" : "Connect Lalamove"}</DialogTitle>
        <DialogDescription id="lalamove-connect-description">
          <b>Malaysia · Sandbox</b> (quotes only; nothing is booked or charged). WareOrb checks the keys with Lalamove, then keeps them only in this
          computer's WareOrb server memory until the demo stops. They are not saved to disk or the browser.
          {replacing && " If the new keys do not work, the current connection stays."}
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-[12.5px]" htmlFor="lalamove-key">API key
        <Input id="lalamove-key" ref={keyRef} type="password" autoComplete="off" spellCheck={false} placeholder="pk_test_…" defaultValue="" readOnly={busy} aria-invalid={!!error} aria-describedby={error ? "lalamove-error" : undefined} onChange={onInput} className="font-mono" />
      </label>
      <label className="flex flex-col gap-1.5 text-[12.5px]" htmlFor="lalamove-secret">API secret
        <Input id="lalamove-secret" ref={secretRef} type="password" autoComplete="off" spellCheck={false} placeholder="sk_test_…" defaultValue="" readOnly={busy} aria-invalid={!!error} aria-describedby={error ? "lalamove-error" : undefined} onChange={onInput} className="font-mono" />
      </label>
      {error && <p id="lalamove-error" role="alert" className="text-[12.5px] text-dispatch">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
        <Button type="submit" disabled={busy || !filled}>{busy && <Spinner data-icon="inline-start" />}{busy ? "Checking with Lalamove…" : "Connect"}</Button>
      </DialogFooter>
    </form>
  );
}
