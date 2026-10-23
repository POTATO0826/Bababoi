import { useMutation, useQuery } from "convex/react";
import { FileTextIcon, ImageIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { run } from "@/convex";
import { cn } from "@/lib/utils";
import { shrink, uploadTo } from "@/scan";
import { actorNow, useWare } from "@/store";
import { DetailShell, Section } from "./detail-shell";
import { History } from "./deal-detail";
import { DictateButton } from "./dictate";

type Line = Doc<"receipts">["lines"][number];

export function ReceiptDetail({ id }: { id: string }) {
  const r = useQuery(api.receiving.get, { receiptId: id as Id<"receipts"> });
  const role = useWare((s) => s.role);
  const skus = useWare((s) => s.ledger?.skus ?? []);
  const genUrl = useMutation(api.receiving.generateUploadUrl);
  const addEvidence = useMutation(api.receiving.addEvidence);
  const saveLines = useMutation(api.receiving.saveLines);
  const post = useMutation(api.receiving.post);
  const reject = useMutation(api.receiving.reject);
  const extract = useMutation(api.receiving.requestExtraction);
  const [lines, setLines] = useState<Line[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileKind, setFileKind] = useState<"photo" | "document">("photo");

  useEffect(() => {
    if (r && !dirty) setLines(r.lines);
  }, [r, dirty]);

  if (!r) return null;
  const open = r.status === "needs_review";
  const reading = r.extraction.status === "running";
  const edit = (i: number, patch: Partial<Line>) => {
    setDirty(true);
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch, source: "staff" } : l)));
  };

  const persist = async () => {
    if (!dirty) return true;
    const ok = await run(saveLines({ actor: actorNow(), receiptId: r._id, lines }));
    if (ok !== undefined) setDirty(false);
    return ok !== undefined;
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const url = await run(genUrl({ actor: actorNow() }));
    if (url) {
      const storageId = await uploadTo(url, await shrink(f));
      await run(addEvidence({ actor: actorNow(), receiptId: r._id, kind: fileKind, storageId, mime: f.type }));
    }
    setBusy(false);
  };

  const ready = lines.length > 0 && lines.every((l) => l.skuCode && l.qty && l.qty > 0 && l.verified);

  return (
    <DetailShell
      title={r.docRef ?? r.code}
      sub={[r.code, r.supplier].filter(Boolean).join(" · ")}
      badges={
        <>
          <Badge variant={open ? "warn" : r.status === "posted" ? "ok" : "tag"}>{open ? "To verify" : r.status === "posted" ? "Posted" : "Rejected"}</Badge>
          {r.synthetic && <Badge variant="tag">Synthetic</Badge>}
        </>
      }
      footer={
        open && (
          <>
            {role === "warehouse" ? (
              <Button
                disabled={!ready || busy}
                onClick={async () => {
                  setBusy(true);
                  if (await persist()) await run(post({ actor: actorNow(), receiptId: r._id }), "Posted to stock");
                  setBusy(false);
                }}
              >
                {busy && <Spinner data-icon="inline-start" />}
                Post to stock
              </Button>
            ) : (
              <Badge variant="tag" className="self-center">
                Warehouse posts
              </Badge>
            )}
            {(role === "warehouse" || role === "owner") && <RejectReceipt onReject={(reason) => void run(reject({ actor: actorNow(), receiptId: r._id, reason }))} />}
          </>
        )
      }
    >
      <Section
        label="Evidence"
        aside={
          open && (
            <div className="flex gap-1">
              <Button variant="quiet" size="icon-xs" title="Photo" onClick={() => (setFileKind("photo"), fileRef.current?.click())}>
                <ImageIcon />
              </Button>
              <Button variant="quiet" size="icon-xs" title="Document" onClick={() => (setFileKind("document"), fileRef.current?.click())}>
                <FileTextIcon />
              </Button>
              <DictateButton
                onText={(text, storageId) => void run(addEvidence({ actor: actorNow(), receiptId: r._id, kind: "voice", text, ...(storageId ? { storageId } : {}) }))}
              />
            </div>
          )
        }
      >
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={fileKind === "photo" ? "image/*" : "image/*,application/pdf"}
          capture={fileKind === "photo" ? "environment" : undefined}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          {r.evidence.map((e, i) =>
            e.url && e.mime?.startsWith("image/") ? (
              <a key={i} href={e.url} target="_blank" rel="noreferrer">
                <img src={e.url} alt="" className="size-16 rounded-md border border-border object-cover" />
              </a>
            ) : (
              <span key={i} className="max-w-full rounded-md border border-border px-2 py-1.5 text-[12px] text-text-2">
                {e.kind === "voice" ? "🎙 " : e.kind === "document" ? "📄 " : ""}
                {e.text ?? (e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="underline">document</a> : e.kind)}
              </span>
            ),
          )}
          {busy && <Spinner />}
          {!r.evidence.length && !busy && <span className="text-[12.5px] text-faint">Add a photo, document or voice note</span>}
        </div>
        {open && r.evidence.length > 0 && (
          <Button variant="outline" size="sm" disabled={reading} onClick={() => void run(extract({ actor: actorNow(), receiptId: r._id }))}>
            {reading ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
            {reading ? "Reading…" : "Read with AI"}
          </Button>
        )}
        {r.extraction.status === "error" && <span className="text-[12px] text-dispatch">{r.extraction.error ?? "Couldn't read"}</span>}
      </Section>

      <Section
        label="Lines"
        aside={
          open && (
            <Button
              variant="quiet"
              size="xs"
              onClick={() =>
                (setDirty(true),
                setLines((ls) => [
                  ...ls,
                  { key: `s${Date.now()}`, rawText: "Added by staff", skuCode: null, candidates: [], qty: null, condition: "good", confidence: 1, questions: [], verified: false, source: "staff" },
                ]))
              }
            >
              <PlusIcon data-icon="inline-start" />
              Line
            </Button>
          )
        }
      >
        {lines.map((l, i) => (
          <div key={l.key} className={cn("flex flex-col gap-1.5 rounded-md border border-border p-2.5", l.verified && "border-ok/40")}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] text-muted-foreground">“{l.rawText}”</span>
              {l.source === "ai" && (
                <Badge variant="tag" className="h-[18px] px-1.5 text-[10.5px]">
                  AI {Math.round(l.confidence * 100)}%
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Select value={l.skuCode ?? ""} onValueChange={(v) => edit(i, { skuCode: v })} disabled={!open}>
                <SelectTrigger size="sm" className="min-w-0 flex-1">
                  <SelectValue placeholder="Pick SKU" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[...new Set([...l.candidates, ...skus.map((s) => s.code)])].map((code) => {
                      const s = skus.find((x) => x.code === code);
                      return (
                        <SelectItem key={code} value={code}>
                          {s ? `${s.model} · ${s.variant}` : code}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                value={l.qty ?? ""}
                onChange={(e) => edit(i, { qty: e.target.value === "" ? null : Math.round(Number(e.target.value)) })}
                disabled={!open}
                className="h-8 w-16 font-mono"
                placeholder="Qty"
              />
              {open && (
                <Button variant="quiet" size="icon-sm" aria-label="Remove line" onClick={() => (setDirty(true), setLines((ls) => ls.filter((_, j) => j !== i)))}>
                  <Trash2Icon />
                </Button>
              )}
            </div>
            {l.questions.map((q) => (
              <span key={q} className="text-[11.5px] text-warn">
                {q}
              </span>
            ))}
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox checked={l.verified} disabled={!open || role !== "warehouse"} onCheckedChange={(v) => edit(i, { verified: v === true })} />
              Counted and checked
            </label>
          </div>
        ))}
        {!lines.length && <span className="text-[12.5px] text-faint">No lines yet</span>}
        {dirty && open && (
          <Button variant="outline" size="sm" onClick={() => void persist()}>
            Save lines
          </Button>
        )}
      </Section>
      <History entity={`receipt:${r._id}`} />
    </DetailShell>
  );
}

function RejectReceipt({ onReject }: { onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return open ? (
    <div className="flex gap-2">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why reject?" className="h-8" />
      <Button size="sm" variant="outline" disabled={!reason.trim()} onClick={() => onReject(reason)}>
        Reject
      </Button>
    </div>
  ) : (
    <Button variant="quiet" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
      Reject
    </Button>
  );
}
