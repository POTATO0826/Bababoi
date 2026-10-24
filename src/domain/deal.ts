// What a deal still needs before quotes can be requested (shared by the UI and the server).
import { inMalaysia } from "./places";

export interface DealFieldsLike {
  buyer?: { name: string };
  qty: number;
  priceSen: number;
  destination?: { lat: number; lng: number; confirmedBy?: string };
  collectAt?: number;
  access?: { floor: number; lift: boolean };
}

export function missingFields(d: DealFieldsLike): string[] {
  const m: string[] = [];
  if (!d.buyer?.name.trim()) m.push("Buyer");
  if (!(d.qty > 0)) m.push("Quantity");
  if (!(d.priceSen > 0)) m.push("Price");
  if (!d.destination) m.push("Destination");
  else if (!inMalaysia(d.destination.lat, d.destination.lng)) m.push("Valid coordinates");
  else if (!d.destination.confirmedBy) m.push("Confirm location");
  if (!Number.isFinite(d.collectAt) || (d.collectAt ?? 0) <= 0) m.push("Collection time");
  if (!d.access || !Number.isSafeInteger(d.access.floor) || d.access.floor < 0 || d.access.floor > 200) m.push("Delivery access");
  return m;
}

export const OPEN_DEAL = ["finding_buyer", "offer_ready", "pending_approval", "approved", "rejected"] as const;
