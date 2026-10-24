// Jarvis "take me there" in the browser: apply a navigation target, and match one offline (no AI model needed).
import { switchFloor } from "@/actions";
import { closePanel, commandById, openCommand } from "@/commands";
import { available } from "@/data/catalog";
import { matchNavigation, navigationTarget, type NavTarget } from "@/domain/navigate";
import { slotCode } from "@/domain/stock";
import { getInventory, getWare, PEOPLE, setWare } from "@/store";

/**
 * Move the screen to a target: open its stage (when this role has it), fly to its floor and zone,
 * select its SKU and highlight its bays. Used for the offline matcher and for the agent's `navigate` event.
 * Returns the lines shown under Jarvis's reply.
 */
export function applyNavigation(t: NavTarget): string[] {
  const traces: string[] = [];
  const role = getWare().role;
  if (t.stage === "inventory") closePanel();
  else if (t.stage) {
    const cmd = commandById(t.stage);
    if (cmd?.roles.includes(role)) {
      openCommand(cmd.id);
      traces.push(`Opened ${cmd.label}`);
    } else traces.push(`${cmd?.label ?? t.stage} is not open to ${PEOPLE[role]}`);
  }
  if (!t.floor) {
    setWare({ highlight: null });
    return traces;
  }
  const highlight = t.slots.length ? { slots: t.slots, label: t.label } : null;
  const floor = t.floor;
  switchFloor(floor, () => {
    const inv = getInventory();
    const cat = t.sku ? inv.byCode.get(t.sku)?.category : t.zone ? inv.zoneCategory(floor, t.zone) : null;
    setWare((s) => ({
      zone: t.zone,
      selected: t.sku && inv.byCode.has(t.sku) ? t.sku : null,
      zoomMul: 1,
      hoverBay: null,
      panelOpen: false,
      highlight,
      openCat: cat ? cat.id : s.openCat,
    }));
  });
  traces.push(`Map → ${t.label}`);
  return traces;
}

/** A short spoken/typed answer for a target, from the live ledger. */
function replyFor(t: NavTarget, purpose: string | undefined): string {
  const codes = t.slots.map(slotCode);
  const list = codes.length > 4 ? `${codes.slice(0, 3).join(", ")} and ${codes.length - 3} more` : codes.join(", ");
  const at = [t.floor && `Floor ${t.floor}`, t.zone && `Zone ${t.zone}`].filter(Boolean).join(", ");
  if (purpose === "place") return `${at} has room: ${list}.`;
  const sku = t.sku ? getInventory().byCode.get(t.sku) : undefined;
  if (sku && purpose !== "ageing") return `${sku.model.name} ${sku.variant} is on ${at}${list ? `, ${list}` : ""}. ${sku.onHand} on hand, ${sku.reserved} reserved, ${available(sku)} available.`;
  if (!t.floor && t.stage) return `Opened ${commandById(t.stage)?.label ?? t.stage}.`;
  return `${t.label}.`;
}

/**
 * Offline "take me there": match the text, work out the target from the live ledger and go.
 * Null when the text doesn't point anywhere (or the ledger isn't loaded yet).
 */
export function navigateFromText(text: string, now = Date.now()): { reply: string; traces: string[] } | null {
  const ledger = getWare().ledger;
  if (!ledger) return null;
  const req = matchNavigation(text, ledger.skus);
  if (!req) return null;
  const t = navigationTarget(ledger, req, now);
  if ("error" in t) return { reply: t.error, traces: [] };
  return { reply: replyFor(t, req.purpose), traces: applyNavigation(t) };
}

export function clearHighlight() {
  setWare({ highlight: null });
}
