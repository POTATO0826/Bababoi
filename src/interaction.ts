/** Click suppression after a drag: the click that ends an orbit must not select anything. */
export const dragState = { suppressClick: false };

/** Marks a popup over the 3D view whose own content scrolls (detail and details panels). */
export const VIEWPORT_PANEL = "data-viewport-panel";

/** Wheel over the map zooms it; wheel over a popup on the map must scroll that popup instead. */
export const wheelZoomsMap = (target: EventTarget | null) =>
  !(target && typeof (target as Element).closest === "function" && (target as Element).closest(`[${VIEWPORT_PANEL}]`));

/** Pointer cursor while over something clickable in the 3D view (see `.wh-viewport` in index.css). */
export function setPointing(pointing: boolean) {
  document.body.dataset.pointing = pointing ? "1" : "";
}
