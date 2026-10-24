import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorText } from "@/convex";
import type { Role } from "@/domain/types";

const roles: Role[] = ["owner", "sales", "warehouse"];

export function StaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const staff = useQuery(api.access.listStaff, open ? {} : "skip");
  const inviteStaff = useMutation(api.access.inviteStaff);
  const updateStaff = useMutation(api.access.updateStaff);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("warehouse");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await inviteStaff({ email: email.trim(), name: name.trim(), role });
      setEmail("");
      setName("");
      setMessage("Invitation recorded. This person can activate access after signing in with this verified email.");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function change(staffId: Id<"staff">, patch: { role?: Role; active?: boolean }) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try { await updateStaff({ staffId, ...patch }); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>Staff access</DialogTitle>
        <DialogDescription>Invite staff by their verified sign-in email. Changes take effect on the server.</DialogDescription>
      </DialogHeader>

      <form onSubmit={invite} className="grid gap-3 rounded-lg border border-border bg-inset p-3 sm:grid-cols-[1fr_1fr]">
        <label className="text-xs text-muted-foreground">Name<Input className="mt-1" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Staff name" /></label>
        <label className="text-xs text-muted-foreground">Verified email<Input className="mt-1" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@business.com" /></label>
        <label className="text-xs text-muted-foreground">Role<Select value={role} onValueChange={(v) => setRole(v as Role)}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent>{roles.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent></Select></label>
        <Button type="submit" className="self-end" disabled={busy || !name.trim() || !email.trim()}>Create invitation</Button>
      </form>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {message && <p role="status" className="text-xs text-ok-light">{message}</p>}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">Current staff</h3>
        {staff === undefined && <p className="text-xs text-muted-foreground">Loading staff…</p>}
        {staff?.map((person) => <div key={person._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <div className="min-w-[130px] flex-1">
            <strong className="block text-sm font-medium">{person.name}</strong>
            <span className="block truncate text-xs text-muted-foreground">{person.email}</span>
            <span className="text-[11px] text-faint">{person.status === "invited" ? "Pending activation" : person.active ? "Active" : "Deactivated"}</span>
          </div>
          <Select value={person.role} onValueChange={(v) => void change(person._id, { role: v as Role })} disabled={busy}>
            <SelectTrigger size="sm" className="w-[116px] capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>{roles.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
          </Select>
          {person.status === "invited" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void change(person._id, { active: false })}>Cancel invitation</Button>}
          {person.status !== "invited" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void change(person._id, { active: !person.active })}>{person.active ? "Deactivate" : "Reactivate"}</Button>}
        </div>)}
        {staff?.length === 0 && <p className="text-xs text-muted-foreground">No staff records yet.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
