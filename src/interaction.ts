/** Click suppression after a drag: the click that ends an orbit must not select anything. */
export const dragState = { suppressClick: false };

/** Pointer cursor while over something clickable in the 3D view (see `.wh-viewport` in index.css). */
export function setPointing(pointing: boolean) {
  document.body.dataset.pointing = pointing ? "1" : "";
}
