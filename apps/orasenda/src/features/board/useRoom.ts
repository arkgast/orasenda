import { useEffect, useState } from "react";
import { capacity } from "./useFolds";

/** A px token (`--column-min-width`) as a number, or null when the token CSS is not loaded. */
function px(name: string): number | null {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(value) ? value : null;
}

/**
 * How many open columns the board's box holds, from the column tokens. With no box to measure
 * (before the first paint, or no layout engine) it answers the default window's three.
 */
export function useRoom(el: HTMLElement | null, active: boolean): number {
  const [room, setRoom] = useState(3);
  useEffect(() => {
    if (!active || !el || typeof ResizeObserver === "undefined") return;
    const min = px("--column-min-width");
    const strip = px("--column-strip-width");
    const gap = px("--space-2");
    const sizes = min !== null && strip !== null && gap !== null ? { min, strip, gap } : null;
    const measure = () => setRoom(capacity(el.clientWidth, sizes));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [el, active]);
  return room;
}
