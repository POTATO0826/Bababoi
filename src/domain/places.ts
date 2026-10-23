// Synthetic places with approximate coordinates. Sales must confirm a destination before quoting.

export interface Place {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export const WAREHOUSE: Place = {
  label: "Warehouse · Shah Alam",
  address: "Seksyen 15, 40200 Shah Alam, Selangor",
  lat: 3.0733,
  lng: 101.5185,
};

export const BUYER_PLACES: readonly Place[] = [
  { label: "Petaling Jaya · SS2", address: "SS2, 47300 Petaling Jaya, Selangor", lat: 3.1185, lng: 101.6223 },
  { label: "Subang Jaya · SS15", address: "SS15, 47500 Subang Jaya, Selangor", lat: 3.0777, lng: 101.5865 },
  { label: "Cheras · Taman Connaught", address: "Taman Connaught, 56000 Cheras, Kuala Lumpur", lat: 3.0815, lng: 101.7375 },
];

/** Rough Malaysia bounding box, to catch swapped or mistyped coordinates. */
export const inMalaysia = (lat: number, lng: number) => lat > 0.8 && lat < 7.5 && lng > 99.5 && lng < 119.5;

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
