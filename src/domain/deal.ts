// What a deal still needs before quotes can be requested (shared by the UI and the server).
import { inMalaysia } from "./places";

export interface DealFieldsLike {
  buyer?: { name: string };
  qty: number;
  priceSen: number;
  destination?: { lat: number; lng: number; confirmedBy?: string };
}

export function missingFields(d: DealFieldsLike): string[] {
  const m: string[] = [];
  if (!d.buyer?.name.trim()) m.push("Buyer");
  if (!(d.qty > 0)) m.push("Quantity");
  if (!(d.priceSen > 0)) m.push("Price");
  if (!d.destination) m.push("Destination");
  else if (!inMalaysia(d.destination.lat, d.destination.lng)) m.push("Valid coordinates");
  else if (!d.destination.confirmedBy) m.push("Confirm location");
  return m;
}

export const OPEN_DEAL = ["finding_buyer", "offer_ready", "pending_approval", "approved", "rejected"] as const;
