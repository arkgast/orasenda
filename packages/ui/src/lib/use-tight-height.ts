import { useSyncExternalStore } from "react";

/** The media query for windows shorter than `layout-tight-height`, or null when the token or matchMedia is missing. */
function query(): string | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  const height = getComputedStyle(document.documentElement)
    .getPropertyValue("--layout-tight-height")
    .trim();
  return height ? `(max-height: ${height})` : null;
}

function subscribe(onChange: () => void): () => void {
  const q = query();
  if (!q) return () => {};
  const list = window.matchMedia(q);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  const q = query();
  return q ? window.matchMedia(q).matches : false;
}

/** True while the window is shorter than the `layout-tight-height` token (read from CSS, never a literal). */
export function useTightHeight(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
