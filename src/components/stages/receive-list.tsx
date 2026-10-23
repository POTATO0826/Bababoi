import { useMutation } from "convex/react";
import { PackagePlusIcon, ScanLineIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { run } from "@/convex";
import type { Receipt } from "@/ledger";
import { actorNow, setWare, useWare } from "@/store";
import { NothingHere, WorkColumn, WorkList, WorkRow } from "./work-column";

const openReceipt = (id: string) => setWare({ detail: { kind: "receipt", id }, floor: 1, zone: null, selected: null });

export function ReceiveList({ className }: { className?: string }) {
  const ledger = useWare((s) => s.ledger);
  const role = useWare((s) => s.role);
  const detail = useWare((s) => s.detail);
  const create = useMutation(api.receiving.create);
  const receipts = ledger?.receipts ?? [];
  const pending = receipts.filter((r) => r.status === "needs_review");
  const done = receipts.filter((r) => r.status !== "needs_review").slice(0, 6);

  const row = (r: Receipt) => (
    <WorkRow
      key={r._id}
      title={r.docRef ?? r.code}
      sub={r.lines.length ? r.lines.map((l) => `${l.qty ?? "?"} × ${l.skuCode ?? l.rawText}`).join(" · ") : `${r.evidence.length} item(s)`}
      active={detail?.id === r._id}
      mine={r.status === "needs_review" && role === "warehouse"}
      onClick={() => openReceipt(r._id)}
      aside={
        r.status === "needs_review" ? (
          <Badge variant="warn">{r.extraction.status === "running" ? "Reading" : "Review"}</Badge>
        ) : (
          <Badge variant={r.status === "posted" ? "ok" : "tag"}>{r.status === "posted" ? "Posted" : "Rejected"}</Badge>
        )
      }
    />
  );

  return (
    <WorkColumn
      title="Receive"
      className={className}
      action={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              const id = await run(create({ actor: actorNow() }));
              if (id) openReceipt(id);
            }}
          >
            <ScanLineIcon data-icon="inline-start" />
            New receipt
          </Button>
          <Button variant="outline" onClick={() => setWare({ receiveOpen: true })} disabled={role !== "warehouse"} title="New model">
            <PackagePlusIcon data-icon="inline-start" />
            Model
          </Button>
        </div>
      }
    >
      <WorkList label="To verify" count={pending.length}>
        {pending.map(row)}
        {!pending.length && <NothingHere title="Nothing to verify" />}
      </WorkList>
      {done.length > 0 && <WorkList label="Recent">{done.map(row)}</WorkList>}
    </WorkColumn>
  );
}
