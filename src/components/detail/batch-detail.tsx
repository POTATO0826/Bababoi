import { useMutation } from "convex/react";
import { SendIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { openDeal } from "@/components/stages/deals-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { run } from "@/convex";
import { fmtRM } from "@/domain/money";
import { actorNow, PEOPLE, useWare } from "@/store";
import { DEAL_STATUS, isOpenDeal, useFlags } from "@/workflow";
import { DetailShell, Facts, Section } from "./detail-shell";

export function BatchDetail({ id }: { id: string }) {
  const flag = useFlags().find((f) => f.batch._id === id);
  const ledger = useWare((s) => s.ledger);
  const role = useWare((s) => s.role);
  const create = useMutation(api.deals.create);
  if (!flag || !ledger) return null;
  const sku = ledger.skus.find((s) => s.code === flag.batch.skuCode);
  const deal = ledger.deals.find((d) => d.batchId === id && isOpenDeal(d));

  return (
    <DetailShell
      title={sku ? `${sku.model} · ${sku.variant}` : flag.batch.skuCode}
      sub={`${flag.batch.code} · ${flag.batch.skuCode}`}
      badges={
        <>
          <Badge variant="ageing">{flag.ageDays} days</Badge>
          <Badge variant="tag">{flag.salesInWindow} sold / {ledger.settings.ageing.windowDays}d</Badge>
          <Badge variant="tag">{flag.bays.join(" · ")}</Badge>
        </>
      }
      footer={
        deal ? (
          <Button variant="outline" onClick={() => openDeal(deal, flag.batch.locations[0]?.slot)}>
            {deal.code} · {DEAL_STATUS[deal.status].label}
          </Button>
        ) : (
          <Button
            disabled={role !== "owner"}
            title={role !== "owner" ? "Owner only" : undefined}
            onClick={async () => {
              const dealId = await run(create({ actor: actorNow(), batchId: id as Id<"batches">, assignee: PEOPLE.sales }), `Sent to ${PEOPLE.sales}`);
              if (dealId) openDeal({ _id: dealId, skuCode: flag.batch.skuCode, batchId: id as Id<"batches"> }, flag.batch.locations[0]?.slot);
            }}
          >
            <SendIcon data-icon="inline-start" />
            Hand to {PEOPLE.sales}
          </Button>
        )
      }
    >
      <Facts
        items={[
          ["Units", flag.qty],
          ["Unreserved", flag.unreserved],
          ["Guide / unit", fmtRM(sku?.price.clearanceSen)],
          ["List / unit", fmtRM(sku?.price.listSen)],
        ]}
      />
      {flag.caveats.length > 0 && (
        <Section label="Note">
          {flag.caveats.map((c) => (
            <span key={c} className="text-[12px] text-muted-foreground">
              {c}
            </span>
          ))}
        </Section>
      )}
    </DetailShell>
  );
}
