import { useEffect, useState, type RefObject } from "react";

export type LayoutTier = "wide" | "mid" | "narrow" | "stacked";

/** ≥1180 wide · 980–1179 mid · <980 narrow · <720 stacked (single column, viewport first). */
export function useLayoutTier(): { tier: LayoutTier; width: number } {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => {
    const on = () => setWidth(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const tier: LayoutTier = width >= 1180 ? "wide" : width >= 980 ? "mid" : width >= 720 ? "narrow" : "stacked";
  return { tier, width };
}

export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
