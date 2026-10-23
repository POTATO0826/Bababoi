import { useAction, useMutation, useQuery } from "convex/react";
import { CheckIcon, ExternalLinkIcon, MapPinIcon, SendIcon, TruckIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { run } from "@/convex";
import { comparable, netRecovery, quoteState, rankQuotes } from "@/domain/costs";
import { missingFields } from "@/domain/deal";
import { fmtRM, sen } from "@/domain/money";
import { BUYER_PLACES, mapsLink, WAREHOUSE } from "@/domain/places";
import { planPick, slotCode } from "@/domain/stock";
import { fit, piecesFor, type VehicleSpec } from "@/domain/vehicle";
import { cn } from "@/lib/utils";
import { actorNow, PEOPLE, useWare } from "@/store";
import { DEAL_STATUS, useNow } from "@/workflow";
import { DetailShell, Section } from "./detail-shell";

type DealDoc = Doc<"deals">;
type QuoteDoc = Doc<"quotes">;
type Service = VehicleSpec & { specialRequests: string[] };

const SOURCE: Record<QuoteDoc["source"], { label: string; variant: "brand" | "tag" | "warn" }> = {
  lalamove_sandbox: { label: "Lalamove sandbox", variant: "brand" },
  manual: { label: "Carrier", variant: "tag" },
  demo_fallback: { label: "Saved demo", variant: "warn" },
};

export function DealDetail({ id }: { id: string }) {
  const deal = useWare((s) => s.ledger?.deals.find((d) => d._id === id));
  const ledger = useWare((s) => s.ledger);
  const quotes = useQuery(api.quotes.forDeal, deal ? { dealId: deal._id } : "skip") ?? [];
  if (!deal || !ledger) return null;
  const sku = ledger.skus.find((s) => s.code === deal.skuCode);
  const st = DEAL_STATUS[deal.status];

  return (
    <DetailShell
      title={sku ? `${sku.model} · ${sku.variant}` : deal.skuCode}
      sub={`${deal.code} · ${deal.brief.bays.join(" ")} · ${deal.brief.ageDays}d`}
      badges={
        <>
          <Badge variant={st.tone}>{st.label}</Badge>
          <Badge variant="tag" className="font-mono">
            v{deal.version}
          </Badge>
          {deal.booking && <Badge variant="tag">Simulated booking</Badge>}
        </>
      }
    >
      <BuyerSection deal={deal} />
      {deal.buyer && <QuotesSection deal={deal} quotes={quotes} packages={sku?.packages ?? []} />}
      {(deal.status === "pending_approval" || deal.decision) && <DecisionSection deal={deal} quotes={quotes} />}
      {(deal.status === "approved" || deal.status === "collected") && <CollectSection deal={deal} />}
      <History entity={`deal:${deal._id}`} />
      <CloseDeal deal={deal} />
    </DetailShell>
  );
}

// ── Buyer ────────────────────────────────────────────────────────────────

function BuyerSection({ deal }: { deal: DealDoc }) {
  const role = useWare((s) => s.role);
  const editable = role === "sales" && ["finding_buyer", "offer_ready", "pending_approval", "rejected"].includes(deal.status);
  const [editing, setEditing] = useState(!deal.buyer && editable);
  const missing = missingFields(deal);
  const confirm = useMutation(api.deals.confirmDestination);

  if (editing && editable) return <BuyerForm deal={deal} onDone={() => setEditing(false)} />;

  return (
    <Section
      label="Buyer"
      aside={
        editable && (
          <Button variant="quiet" size="xs" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )
      }
    >
      {deal.buyer ? (
        <div className="flex flex-col gap-1 text-[13px]">
          <Line k="Buyer" v={deal.buyer.name} />
          <Line k="Offer" v={`${deal.qty} × · ${fmtRM(deal.priceSen)}`} />
          <Line
            k="To"
            v={
              deal.destination ? (
                <span className="inline-flex items-center gap-1.5">
                  {deal.destination.label}
                  <a href={mapsLink(deal.destination.lat, deal.destination.lng)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open map">
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </span>
              ) : (
                "—"
              )
            }
          />
          <Line k="Access" v={`${deal.access.floor === 0 ? "Ground" : `Floor ${deal.access.floor}`}${deal.access.lift ? " · lift" : " · stairs"}`} />
          <Line k="Unloading" v={deal.unloading === "requested" ? "Needed" : "No"} />
          <Line k="Freight" v={deal.freightPayer === "merchant" ? "We pay" : "Buyer pays"} />
          {deal.packingSen > 0 && <Line k="Packing" v={fmtRM(deal.packingSen)} />}
        </div>
      ) : (
        <span className="text-[13px] text-muted-foreground">{PEOPLE.sales} is finding a buyer · guide {fmtRM(deal.brief.guideSen)} / unit</span>
      )}
      {deal.destination && !deal.destination.confirmedBy && editable && (
        <Button variant="outline" size="sm" onClick={() => void run(confirm({ actor: actorNow(), dealId: deal._id, expectedVersion: deal.version }), "Location confirmed")}>
          <MapPinIcon data-icon="inline-start" />
          Confirm location with buyer
        </Button>
      )}
      {deal.buyer && missing.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {missing.map((m) => (
            <Badge key={m} variant="warn">
              {m}
            </Badge>
          ))}
        </div>
      )}
    </Section>
  );
}

function Line({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate text-right">{v}</span>
    </div>
  );
}

function BuyerForm({ deal, onDone }: { deal: DealDoc; onDone: () => void }) {
  const update = useMutation(api.deals.update);
  const presetIndex = BUYER_PLACES.findIndex((p) => p.lat === deal.destination?.lat && p.lng === deal.destination?.lng);
  const [name, setName] = useState(deal.buyer?.name ?? "");
  const [qty, setQty] = useState(String(deal.qty));
  const [price, setPrice] = useState(String(deal.priceSen / 100));
  const [place, setPlace] = useState(deal.destination ? (presetIndex >= 0 ? String(presetIndex) : "custom") : "0");
  const [lat, setLat] = useState(String(deal.destination?.lat ?? ""));
  const [lng, setLng] = useState(String(deal.destination?.lng ?? ""));
  const [address, setAddress] = useState(deal.destination?.address ?? "");
  const [floor, setFloor] = useState(String(deal.access.floor));
  const [lift, setLift] = useState(deal.access.lift);
  const [when, setWhen] = useState(deal.collectAt ? toLocalInput(deal.collectAt) : "");
  const [unloading, setUnloading] = useState(deal.unloading);
  const [payer, setPayer] = useState(deal.freightPayer);
  const [packing, setPacking] = useState(String(deal.packingSen / 100));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const preset = place === "custom" ? null : BUYER_PLACES[Number(place)];
    const destination = preset
      ? { label: preset.label, address: preset.address, lat: preset.lat, lng: preset.lng }
      : { label: address.split(",")[0]?.trim() || "Custom", address: address.trim(), lat: Number(lat), lng: Number(lng) };
    setBusy(true);
    const ok = await run(
      update({
        actor: actorNow(),
        dealId: deal._id,
        expectedVersion: deal.version,
        patch: {
          buyer: { name: name.trim() },
          qty: Math.round(Number(qty)),
          priceSen: sen(Number(price) || 0),
          destination,
          access: { floor: Math.max(0, Math.round(Number(floor) || 0)), lift },
          ...(when ? { collectAt: new Date(when).getTime() } : {}),
          unloading,
          freightPayer: payer,
          packingSen: sen(Number(packing) || 0),
        },
      }),
    );
    setBusy(false);
    if (ok != null) onDone();
  };

  return (
    <Section label="Buyer">
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="d-name">Buyer</FieldLabel>
          <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="d-qty">Units (max {deal.brief.qty})</FieldLabel>
            <Input id="d-qty" type="number" min={1} max={deal.brief.qty} value={qty} onChange={(e) => setQty(e.target.value)} className="font-mono" />
          </Field>
          <Field>
            <FieldLabel htmlFor="d-price">Total RM</FieldLabel>
            <Input id="d-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="font-mono" />
          </Field>
        </div>
        <Field>
          <FieldLabel>Deliver to</FieldLabel>
          <Select value={place} onValueChange={setPlace}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {BUYER_PLACES.map((p, i) => (
                  <SelectItem key={p.label} value={String(i)}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Other address…</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {place === "custom" && (
          <>
            <Field>
              <FieldLabel htmlFor="d-addr">Address</FieldLabel>
              <Input id="d-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="d-lat">Lat</FieldLabel>
                <Input id="d-lat" value={lat} onChange={(e) => setLat(e.target.value)} className="font-mono" placeholder="3.1185" />
              </Field>
              <Field>
                <FieldLabel htmlFor="d-lng">Lng</FieldLabel>
                <Input id="d-lng" value={lng} onChange={(e) => setLng(e.target.value)} className="font-mono" placeholder="101.6223" />
              </Field>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="d-floor">Floor</FieldLabel>
            <Input id="d-floor" type="number" min={0} value={floor} onChange={(e) => setFloor(e.target.value)} className="font-mono" />
          </Field>
          <Field orientation="horizontal" className="self-end pb-2">
            <Checkbox id="d-lift" checked={lift} onCheckedChange={(v) => setLift(v === true)} />
            <FieldLabel htmlFor="d-lift">Lift</FieldLabel>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="d-when">Collection</FieldLabel>
          <Input id="d-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Unloading</FieldLabel>
          <Segment value={unloading} onChange={setUnloading} items={[["requested", "Needed"], ["not_needed", "No"]]} />
        </Field>
        <Field>
          <FieldLabel>Freight</FieldLabel>
          <Segment value={payer} onChange={setPayer} items={[["merchant", "We pay"], ["buyer", "Buyer pays"]]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="d-pack">Packing RM</FieldLabel>
          <Input id="d-pack" type="number" min={0} value={packing} onChange={(e) => setPacking(e.target.value)} className="font-mono" />
        </Field>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy || !name.trim()} onClick={save}>
            {busy && <Spinner data-icon="inline-start" />}
            Save
          </Button>
          {deal.buyer && (
            <Button variant="outline" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </FieldGroup>
    </Section>
  );
}

function Segment<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      spacing={0.5}
      className="w-full rounded-[7px] border border-border bg-inset p-[3px]"
    >
      {items.map(([k, label]) => (
        <ToggleGroupItem key={k} value={k} variant="segment" size="segment" className="flex-1">
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const toLocalInput = (t: number) => {
  const d = new Date(t);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// ── Quotes ───────────────────────────────────────────────────────────────

function useServices() {
  const load = useAction(api.lalamove.services);
  const [state, setState] = useState<{ source: "live" | "fixture"; services: Service[] } | null>(null);
  useEffect(() => {
    let alive = true;
    load({})
      .then((r) => alive && setState(r))
      .catch(() => alive && setState({ source: "fixture", services: [] }));
    return () => {
      alive = false;
    };
  }, [load]);
  return state;
}

function QuotesSection({ deal, quotes, packages }: { deal: DealDoc; quotes: QuoteDoc[]; packages: Doc<"skus">["packages"] }) {
  const role = useWare((s) => s.role);
  const now = useNow(1000);
  const services = useServices();
  const request = useMutation(api.quotes.request);
  const demo = useMutation(api.quotes.addDemoReplies);
  const submit = useMutation(api.deals.submit);
  const demoMode = useWare((s) => s.ledger?.settings.demoMode);
  const [picked, setPicked] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const missing = missingFields(deal);
  const canQuote = (role === "sales" || role === "owner") && missing.length === 0 && ["offer_ready", "pending_approval", "rejected"].includes(deal.status);
  const canSubmit = role === "sales" && ["offer_ready", "rejected"].includes(deal.status);

  const pieces = useMemo(() => piecesFor(packages, deal.qty), [packages, deal.qty]);
  const vehicles = (services?.services ?? []).map((v) => ({ v, f: fit(pieces, v) }));
  const current = quotes.filter((q) => q.dealVersion === deal.version);
  const { ranked, other } = rankQuotes(current, deal, now);
  const best = ranked[0]?.quote._id;

  return (
    <Section
      label="Delivery"
      aside={services && <Badge variant="tag">{services.source === "live" ? "Lalamove MY" : "Sizes: sample"}</Badge>}
    >
      {canQuote && (
        <div className="flex flex-col gap-1.5">
          {!services && <Spinner />}
          {vehicles.map(({ v, f }) => {
            const on = picked.includes(v.key);
            return (
              <label
                key={v.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-[12.5px]",
                  on && "border-brand/50 bg-brand/8",
                  f.status === "no" && "cursor-not-allowed opacity-50",
                )}
              >
                <Checkbox
                  checked={on}
                  disabled={f.status === "no" || (!on && picked.length >= 3)}
                  onCheckedChange={(c) => setPicked((p) => (c ? [...p, v.key] : p.filter((x) => x !== v.key)))}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{v.label}</span>
                  <span className="truncate font-mono text-[10.5px] text-faint">{f.reasons[0]}</span>
                </span>
                <Badge variant={f.status === "fits" ? "ok" : f.status === "check" ? "warn" : "tag"}>
                  {f.status === "fits" ? "Fits" : f.status === "check" ? "Check" : f.status === "no" ? "Too small" : "?"}
                </Badge>
              </label>
            );
          })}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={!picked.length}
              onClick={async () => {
                const r = await run(
                  request({
                    actor: actorNow(),
                    dealId: deal._id,
                    expectedVersion: deal.version,
                    services: picked.map((key) => ({ key, specialRequests: [] })),
                  }),
                );
                if (r) setPicked([]);
              }}
            >
              <TruckIcon data-icon="inline-start" />
              Get Lalamove quotes
            </Button>
            <Button size="sm" variant="outline" onClick={() => setManual(!manual)}>
              Add quote
            </Button>
            {demoMode && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => void run(demo({ actor: actorNow(), dealId: deal._id, expectedVersion: deal.version }))}
                title="Synthetic carrier replies"
              >
                Demo
              </Button>
            )}
          </div>
          {manual && <ManualQuote deal={deal} onDone={() => setManual(false)} />}
        </div>
      )}

      {current.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {[...ranked.map((r) => ({ quote: r.quote, reason: null as string | null })), ...other].map(({ quote: q, reason }) => (
            <QuoteRow
              key={q._id}
              q={q}
              deal={deal}
              now={now}
              reason={reason}
              best={q._id === best}
              selectable={canSubmit && !reason}
              selected={chosen === q._id}
              onSelect={() => setChosen(q._id)}
            />
          ))}
        </div>
      )}
      {quotes.some((q) => q.dealVersion !== deal.version) && (
        <span className="text-[11.5px] text-faint">{quotes.filter((q) => q.dealVersion !== deal.version).length} quotes from older versions hidden</span>
      )}

      {canSubmit && (
        <Button
          disabled={!chosen && !best}
          onClick={() =>
            void run(
              submit({ actor: actorNow(), dealId: deal._id, expectedVersion: deal.version, quoteId: (chosen ?? best) as Id<"quotes"> }),
              `Sent to ${PEOPLE.owner}`,
            )
          }
        >
          <SendIcon data-icon="inline-start" />
          Send to {PEOPLE.owner}
        </Button>
      )}
    </Section>
  );
}

function QuoteRow({
  q,
  deal,
  now,
  reason,
  best,
  selectable,
  selected,
  onSelect,
}: {
  q: QuoteDoc;
  deal: DealDoc;
  now: number;
  reason: string | null;
  best: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const role = useWare((s) => s.role);
  const setUnloading = useMutation(api.quotes.setUnloading);
  const [extra, setExtra] = useState("");
  const src = SOURCE[q.source];
  const st = quoteState(q, deal, now);
  const left = q.expiresAt ? Math.max(0, Math.floor((q.expiresAt - now) / 1000)) : null;
  const c = q.status === "ok" ? comparable(q, deal) : null;
  const needsUnloading = deal.unloading === "requested" && q.status === "ok" && q.unloading === "unknown" && st === "current";

  return (
    <div
      onClick={selectable ? onSelect : undefined}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2",
        selectable && "cursor-pointer hover:border-border-strong",
        selected && "border-brand/60 bg-brand/8",
        reason && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[12.5px]">
            <span className="truncate font-medium">{q.carrier}</span>
            <span className="truncate text-faint">{q.service}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={src.variant} className="h-[18px] px-1.5 text-[10.5px]">
              {q.note === "Synthetic" ? "Synthetic" : src.label}
            </Badge>
            {best && (
              <Badge variant="ok" className="h-[18px] px-1.5 text-[10.5px]">
                Lowest
              </Badge>
            )}
            {reason && (
              <Badge variant="tag" className="h-[18px] px-1.5 text-[10.5px]">
                {reason}
              </Badge>
            )}
          </span>
        </span>
        <span className="flex flex-col items-end">
          {q.status === "pending" ? (
            <Spinner />
          ) : q.status === "error" ? (
            <span className="max-w-[140px] truncate text-[11.5px] text-dispatch">{q.error?.message ?? "Failed"}</span>
          ) : (
            <>
              <span className="font-mono text-[14px] font-semibold tabular-nums">
                {c?.kind === "complete" ? fmtRM(c.sen) : fmtRM(q.totalSen)}
                {c?.kind === "incomplete" && <span className="text-warn">+?</span>}
              </span>
              <span className="font-mono text-[10.5px] text-faint">
                {st === "expired" ? "expired" : left != null && left < 3600 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : q.unloading === "included" ? "incl. unloading" : ""}
              </span>
            </>
          )}
        </span>
      </div>
      {needsUnloading && (role === "sales" || role === "owner") && (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="flex-1 text-[11.5px] text-warn">Unloading?</span>
          <Button size="xs" variant="outline" onClick={() => void run(setUnloading({ actor: actorNow(), quoteId: q._id, unloading: "included" }))}>
            Included
          </Button>
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="RM" className="h-6 w-14 px-1.5 font-mono text-xs" />
          <Button
            size="xs"
            variant="outline"
            disabled={!(Number(extra) >= 0) || extra === ""}
            onClick={() => void run(setUnloading({ actor: actorNow(), quoteId: q._id, unloading: "excluded", unloadingSen: sen(Number(extra)) }))}
          >
            Extra
          </Button>
        </div>
      )}
    </div>
  );
}

function ManualQuote({ deal, onDone }: { deal: DealDoc; onDone: () => void }) {
  const add = useMutation(api.quotes.addManual);
  const [carrier, setCarrier] = useState("");
  const [service, setService] = useState("");
  const [total, setTotal] = useState("");
  const [unloading, setUnloading] = useState<"included" | "excluded" | "unknown">("included");
  const [extra, setExtra] = useState("");
  return (
    <FieldGroup className="gap-2.5 rounded-md border border-border p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier" />
        <Input value={service} onChange={(e) => setService(e.target.value)} placeholder="Vehicle" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Total RM" className="font-mono" type="number" />
        {unloading === "excluded" && (
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Unloading RM" className="font-mono" type="number" />
        )}
      </div>
      <Segment value={unloading} onChange={setUnloading} items={[["included", "Incl."], ["excluded", "Extra"], ["unknown", "Unknown"]]} />
      <Button
        size="sm"
        disabled={!carrier.trim() || !(Number(total) > 0)}
        onClick={async () => {
          const ok = await run(
            add({
              actor: actorNow(),
              dealId: deal._id,
              expectedVersion: deal.version,
              carrier,
              service,
              totalSen: sen(Number(total)),
              unloading,
              ...(unloading === "excluded" && extra !== "" ? { unloadingSen: sen(Number(extra)) } : {}),
              validHours: 24,
            }),
          );
          if (ok !== undefined) onDone();
        }}
      >
        Add
      </Button>
    </FieldGroup>
  );
}

// ── Owner decision ───────────────────────────────────────────────────────

function DecisionSection({ deal, quotes }: { deal: DealDoc; quotes: QuoteDoc[] }) {
  const role = useWare((s) => s.role);
  const now = useNow(1000);
  const decide = useMutation(api.deals.decide);
  const request = useMutation(api.quotes.request);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const proposed = quotes.find((q) => q._id === (deal.decision?.quoteId ?? deal.proposal?.quoteId));
  // A refreshed quote for the same option replaces an expired one.
  const fresh =
    proposed &&
    quotes.find(
      (q) => q.dealVersion === deal.version && q.source === proposed.source && q.service === proposed.service && q.carrier === proposed.carrier && quoteState(q, deal, now) === "current",
    );
  const q = fresh ?? proposed;
  const st = q ? quoteState(q, deal, now) : null;
  const cost = q && q.status === "ok" ? comparable(q, deal) : null;
  const rec = cost ? netRecovery(deal, cost) : null;
  const pending = deal.status === "pending_approval";
  const batch = useWare((s) => s.ledger?.batches.find((b) => b._id === deal.batchId));
  const frees = useMemo(() => {
    if (!batch || !pending) return [];
    try {
      return planPick(batch.locations, deal.qty)
        .filter((p) => batch.locations.find((l) => l.slot === p.slot)?.qty === p.qty)
        .map((p) => slotCode(p.slot));
    } catch {
      return [];
    }
  }, [batch, deal.qty, pending]);

  return (
    <Section label={pending ? "Approval" : "Decision"}>
      <div className="flex flex-col gap-1 rounded-md border border-border bg-inset-2 p-3 text-[13px]">
        <Line k="Sale" v={fmtRM(deal.priceSen)} />
        <Line
          k={`Delivery${q ? ` · ${q.carrier}` : ""}`}
          v={deal.freightPayer === "buyer" ? "Buyer pays" : rec?.deliverySen != null ? `− ${fmtRM(rec.deliverySen)}` : "Unknown"}
        />
        {deal.packingSen > 0 && <Line k="Packing" v={`− ${fmtRM(deal.packingSen)}`} />}
        <div className="my-1 h-px bg-border" />
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Net recovery</span>
          <span className="font-mono text-[18px] font-semibold tabular-nums">{fmtRM(rec?.netSen ?? null)}</span>
        </div>
        <span className="text-right text-[10.5px] text-faint">before stock cost · not profit</span>
      </div>
      {q && (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={SOURCE[q.source].variant}>{q.note === "Synthetic" ? "Synthetic" : SOURCE[q.source].label}</Badge>
          {st === "expired" && <Badge variant="dispatch">Quote expired</Badge>}
          {frees.length > 0 && <Badge variant="tag">Frees {frees.join(" ")}</Badge>}
        </div>
      )}
      {deal.decision && !pending && (
        <span className="text-[12.5px] text-muted-foreground">
          {deal.decision.approved ? "Approved" : "Rejected"} by {deal.decision.by.name}
          {deal.decision.reason ? ` · ${deal.decision.reason}` : ""}
        </span>
      )}
      {pending && role === "owner" && q && (
        <div className="flex flex-col gap-2">
          {st === "expired" && q.source === "lalamove_sandbox" ? (
            <Button
              variant="outline"
              onClick={() =>
                void run(request({ actor: actorNow(), dealId: deal._id, expectedVersion: deal.version, services: [{ key: q.service, specialRequests: [] }] }))
              }
            >
              Refresh quote
            </Button>
          ) : null}
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (needed to reject)" className="min-h-14 text-[13px]" />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy || st !== "current" || rec?.netSen == null}
              onClick={async () => {
                setBusy(true);
                await run(
                  decide({ actor: actorNow(), dealId: deal._id, expectedVersion: deal.version, quoteId: q._id, approve: true, ...(reason.trim() ? { reason } : {}) }),
                  "Approved · stock reserved",
                );
                setBusy(false);
              }}
            >
              <CheckIcon data-icon="inline-start" />
              Approve
            </Button>
            <Button
              variant="outline"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                setBusy(true);
                await run(decide({ actor: actorNow(), dealId: deal._id, expectedVersion: deal.version, quoteId: q._id, approve: false, reason }), "Rejected");
                setBusy(false);
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Warehouse collection ─────────────────────────────────────────────────

function CollectSection({ deal }: { deal: DealDoc }) {
  const role = useWare((s) => s.role);
  const res = useWare((s) => s.ledger?.reservations.find((r) => r._id === deal.reservationId));
  const confirm = useMutation(api.deals.confirmCollection);
  const [sure, setSure] = useState(false);
  const pick = res?.pick ?? [];

  return (
    <Section label="Collection" aside={deal.booking && <Badge variant="tag">{deal.booking.ref}</Badge>}>
      {deal.status === "approved" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {pick.map((p) => (
              <Badge key={p.slot} variant="reserved" className="font-mono">
                {slotCode(p.slot)} ×{p.qty}
              </Badge>
            ))}
          </div>
          {role === "warehouse" &&
            (sure ? (
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void run(confirm({ actor: actorNow(), dealId: deal._id }), "Collected · stock updated")}>
                  Confirm {deal.qty} left the warehouse
                </Button>
                <Button variant="outline" onClick={() => setSure(false)}>
                  Back
                </Button>
              </div>
            ) : (
              <Button onClick={() => setSure(true)}>
                <TruckIcon data-icon="inline-start" />
                Goods collected
              </Button>
            ))}
        </>
      ) : (
        <span className="text-[12.5px] text-muted-foreground">
          {deal.qty} collected {deal.collectedAt ? new Date(deal.collectedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""} · from {WAREHOUSE.label}
        </span>
      )}
    </Section>
  );
}

// ── History / close ──────────────────────────────────────────────────────

export function History({ entity }: { entity: string }) {
  const rows = useQuery(api.ledger.history, { entity }) ?? [];
  if (!rows.length) return null;
  return (
    <Section label="History">
      <div className="flex flex-col">
        {rows.slice(0, 6).map((h) => (
          <div key={h._id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 border-t border-border-inner py-1.5 text-[12px]">
            <span className="font-mono text-[11px] text-faint">{new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
            <span className="truncate text-text-2">
              {h.actor.name} · {h.summary}
              {h.reason ? ` · ${h.reason}` : ""}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function CloseDeal({ deal }: { deal: DealDoc }) {
  const role = useWare((s) => s.role);
  const close = useMutation(api.deals.close);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!(role === "owner" || role === "sales") || deal.status === "collected" || deal.status === "closed") return null;
  return open ? (
    <div className="flex gap-2">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why close?" className="h-8" />
      <Button size="sm" variant="outline" disabled={!reason.trim()} onClick={() => void run(close({ actor: actorNow(), dealId: deal._id, reason }), "Deal closed")}>
        Close
      </Button>
    </div>
  ) : (
    <Button variant="quiet" size="sm" className="self-start text-muted-foreground" onClick={() => setOpen(true)}>
      Close deal
    </Button>
  );
}
