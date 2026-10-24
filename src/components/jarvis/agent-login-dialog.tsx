// Local demo: connect Jarvis with a Claude API key. The key stays in this component's
// state only while the form is open and goes once, as a same-origin POST body, to this computer's server.
import { KeyRoundIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { closeAgentLogin, loginLocalAgent, refreshLocalAgent } from "@/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useWare } from "@/store";

export function AgentLoginDialog() {
  const open = useWare((s) => s.agentLoginOpen);
  const replacing = useWare((s) => s.localAgent?.ready === true);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeAgentLogin(); }}>
      <DialogContent className="sm:max-w-[440px]" aria-describedby="agent-login-description">
        {open && <LoginForm replacing={replacing} />}
      </DialogContent>
    </Dialog>
  );
}

function LoginForm({ replacing }: { replacing: boolean }) {
  // Uncontrolled field: the key lives only in the input element (never in React state or a DOM attribute).
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Unmount (close, cancel, success) discards the key with this component's state; stop an unfinished check.
    return () => pending.current?.abort();
  }, []);

  const clearKey = () => {
    if (inputRef.current) inputRef.current.value = "";
    setHasKey(false);
  };

  const cancel = () => {
    const wasChecking = !!pending.current;
    pending.current?.abort();
    clearKey();
    closeAgentLogin();
    if (wasChecking) void refreshLocalAgent();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const key = inputRef.current?.value.trim() ?? "";
    if (!key) { setError("Enter a Claude API key."); return; }
    setBusy(true);
    setError(null);
    const abort = new AbortController();
    pending.current = abort;
    try {
      const r = await loginLocalAgent(key, abort.signal);
      if (abort.signal.aborted) return;
      if (r.ok) clearKey();
      else {
        setError(r.error);
        inputRef.current?.select();
      }
    } finally {
      pending.current = null;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" autoComplete="off">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><KeyRoundIcon className="size-4" />{replacing ? "Switch Jarvis's Claude API key" : "Connect Jarvis to Claude"}</DialogTitle>
        <DialogDescription id="agent-login-description">
          Provider: <b>Anthropic · Claude API key</b>. The key is checked with Claude, then kept only in this computer's
          WareOrb server memory until the demo stops. It is not saved to disk or the browser and is never shown again.
          {replacing && " If the new key does not work, the current connection stays."}
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-[12.5px]" htmlFor="agent-api-key">
        Claude API key
        <Input
          id="agent-api-key"
          ref={inputRef}
          type="password"
          name="claude-api-key"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          defaultValue=""
          readOnly={busy}
          aria-invalid={!!error}
          aria-describedby={error ? "agent-login-error" : undefined}
          onChange={(e) => { setHasKey(e.target.value.trim().length > 0); setError(null); }}
          className="font-mono"
        />
      </label>
      {error && <p id="agent-login-error" role="alert" className="text-[12.5px] text-dispatch">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
        <Button type="submit" disabled={busy || !hasKey}>{busy && <Spinner data-icon="inline-start" />}{busy ? "Checking key…" : "Log in"}</Button>
      </DialogFooter>
    </form>
  );
}
