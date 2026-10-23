import { showOnMap } from "@/actions";
import { Badge } from "@/components/ui/badge";
import { setWare, useWare } from "@/store";
import { DEAL_STATUS, isOpenDeal, useFlags } from "@/workflow";
import { NothingHere, WorkColumn, WorkList, WorkRow } from "./work-column";

export function AgeingList({ className }: { className?: string }) {
  const flags = useFlags().filter((f) => f.flagged);
  const ledger = useWare((s) => s.ledger);
  const detail = useWare((s) => s.detail);
  const rule = ledger?.settings.ageing;
  const skus = new Map(ledger?.skus.map((s) => [s.code, s]));
  const dealFor = (batchId: string) => ledger?.deals.find((d) => d.batchId === batchId && isOpenDeal(d));

  return (
    <WorkColumn
      title="Ageing"
      className={className}
      aside={rule && <span className="font-mono text-[11px] text-muted-foreground">≥{rule.minAgeDays}d · ≤{rule.maxSales} sold/{rule.windowDays}d</span>}
    >
      <WorkList label="Unsold batches" count={flags.length}>
        {flags.map((f) => {
          const sku = skus.get(f.batch.skuCode);
          const deal = dealFor(f.batch._id);
          return (
            <WorkRow
              key={f.batch._id}
              title={sku ? `${sku.model} · ${sku.variant}` : f.batch.skuCode}
              sub={`${f.batch.code} · ${f.qty} units · ${f.bays.join(" ")}`}
              active={detail?.id === f.batch._id}
              mine={!deal}
              onClick={() => {
                setWare({ detail: { kind: "batch", id: f.batch._id } });
                showOnMap(f.batch.skuCode, f.batch.locations[0]?.slot);
              }}
              aside={
                deal ? (
                  <Badge variant={DEAL_STATUS[deal.status].tone}>{DEAL_STATUS[deal.status].label}</Badge>
                ) : (
                  <Badge variant="ageing" className="font-mono">
                    {f.ageDays}d
                  </Badge>
                )
              }
            />
          );
        })}
        {!flags.length && <NothingHere title="No ageing stock" />}
      </WorkList>
    </WorkColumn>
  );
}
