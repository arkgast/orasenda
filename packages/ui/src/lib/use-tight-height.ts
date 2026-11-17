import { useSyncExternalStore } from "react";

let cached: { matchMedia: typeof window.matchMedia; list: MediaQueryList | null } | null = null;

/** The MediaQueryList for windows shorter than `layout-tight-height`, resolved once per matchMedia, or null when the token or matchMedia is missing. */
function list(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  if (cached?.matchMedia === window.matchMedia) return cached.list;
  const height = getComputedStyle(document.documentElement)
    .getPropertyValue("--layout-tight-height")
    .trim();
  const found = height ? window.matchMedia(`(height < ${height})`) : null;
  cached = { matchMedia: window.matchMedia, list: found };
  return found;
}

function subscribe(onChange: () => void): () => void {
  const l = list();
  if (!l) return () => {};
  l.addEventListener("change", onChange);
  return () => l.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return list()?.matches ?? false;
}

/** True while the window is shorter than the `layout-tight-height` token (read from CSS, never a literal). */
export function useTightHeight(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
