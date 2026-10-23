import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { showOnMap } from "@/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { run } from "@/convex";
import { fmtRM } from "@/domain/money";
import { cn } from "@/lib/utils";
import { actorNow, useWare } from "@/store";
import { useSuggestions, type ReplenishRow } from "@/workflow";
import { NothingHere, WorkColumn, WorkList } from "./work-column";

export function ReplenishList({ className }: { className?: string }) {
  const rows = useSuggestions();
  const ledger = useWare((s) => s.ledger);
  const rule = ledger?.settings.replenish;
  return (
    <WorkColumn
      title="Replenish"
      className={className}
      aside={rule && <span className="font-mono text-[11px] text-muted-foreground">{rule.coverageDays}-day cover · {fmtRM(rule.budgetSen)}</span>}
    >
      <WorkList label="Suggested orders" count={rows.length}>
        {rows.map((r) => (
          <SuggestionRow key={r.code} row={r} />
        ))}
        {!rows.length && <NothingHere title="Nothing to reorder" />}
      </WorkList>
    </WorkColumn>
  );
}

function SuggestionRow({ row: r }: { row: ReplenishRow }) {
  const role = useWare((s) => s.role);
  const createPO = useMutation(api.replenish.createPO);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className={cn("border-t border-border-inner px-3.5 py-2.5 transition-colors", open && "bg-hover-row")}>
      <button className="flex w-full items-center gap-3 text-left" onClick={() => (setOpen(!open), showOnMap(r.code))}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-medium">{r.title}</span>
          <span className="truncate font-mono text-[11.5px] text-faint">
            {r.netSales} sold · {r.onHand - r.reserved} free · {r.incoming} in
          </span>
        </span>
        <Badge variant="brand" className="font-mono">
          +{r.s.suggested}
        </Badge>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 pl-0.5">
          {r.s.lines.map((l) => (
            <span key={l} className="font-mono text-[11px] text-muted-foreground">
              {l}
            </span>
          ))}
          <Button
            size="sm"
            disabled={role !== "owner" || busy}
            title={role !== "owner" ? "Owner only" : undefined}
            onClick={async () => {
              setBusy(true);
              await run(createPO({ actor: actorNow(), skuCode: r.code, qty: r.s.suggested, rationale: r.s.lines.join(" | ") }), `PO for ${r.s.suggested} × ${r.code}`);
              setBusy(false);
              setOpen(false);
            }}
          >
            Order {r.s.suggested}
          </Button>
        </div>
      )}
    </div>
  );
}
