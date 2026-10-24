// Render-harness stand-in for the app's `@/actions` module. The real module opens a Convex client and voice I/O;
// the scene only imports click handlers from it, and nothing is clicked while rendering video frames.
const noop = (..._a: unknown[]) => {};
export const selectSku = noop;
export const zoomZone = noop;
export const showOnMap = noop;
export const backToOverview = noop;
export const escapeZone = noop;
export const resetCamera = noop;
export const setView = noop;
export const switchFloor = noop;
export const openAgent = noop;
