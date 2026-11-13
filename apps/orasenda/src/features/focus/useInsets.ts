import type { FocusInsets } from "@shared/ipc/bindings";
import { events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useEffect, useState } from "react";

const NONE: FocusInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** `insets=t,r,b,l` from the window's URL; anything else (missing, odd, negative) is no inset. */
export function parseInsets(search: string): FocusInsets {
  const raw = new URLSearchParams(search).get("insets");
  const parts = raw?.split(",").map(Number) ?? [];
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0)) return NONE;
  const [top, right, bottom, left] = parts as [number, number, number, number];
  return { top, right, bottom, left };
}

/**
 * The visible-frame insets of this window's display (the menu bar, the Dock): the URL's at first,
 * then every `focus-insets` event Rust sends this window when the display changes.
 */
export function useInsets(): FocusInsets {
  const [insets, setInsets] = useState(() => parseInsets(window.location.search));
  useEffect(() => subscribe("focus-insets", events.focusInsets.listen, setInsets), []);
  return insets;
}
