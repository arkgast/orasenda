import { useCallback, useEffect, useRef, useState } from "react";
import type { PaneId } from "./panes";

/**
 * Where focus goes after a pane opens: nowhere (a pointer pick: the nav item keeps it), the pane
 * heading, or a field. A field's function returns false when it isn't there; the heading follows.
 */
export type PaneFocus = "none" | "heading" | ((root: HTMLElement) => boolean);

/**
 * The open pane, and what a change of pane does: the scroll goes back to the top and focus goes
 * where `go` said. `visit` counts changes, so opening the same pane again still moves focus.
 */
export function usePaneFocus(initial: PaneId) {
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const wanted = useRef<PaneFocus>("none");
  // A field that wasn't there yet (the presets still loading): `retry` tries it again.
  const pending = useRef<((root: HTMLElement) => boolean) | null>(null);
  const [state, setState] = useState<{ pane: PaneId; visit: number }>({
    pane: initial,
    visit: 0,
  });

  const go = useCallback((pane: PaneId, focus: PaneFocus) => {
    wanted.current = focus;
    pending.current = null;
    setState((before) => ({ pane, visit: before.visit + 1 }));
  }, []);

  useEffect(() => {
    if (state.visit === 0) return;
    const region = root.current?.querySelector<HTMLElement>('[data-slot="scroll-region"]');
    if (region) region.scrollTop = 0;
    const focus = wanted.current;
    wanted.current = "none";
    if (focus === "none") return;
    if (typeof focus === "function" && root.current) {
      if (focus(root.current)) return;
      pending.current = focus;
    }
    heading.current?.focus();
  }, [state.visit]);

  /** Tries the field a target asked for again, if it wasn't there and focus hasn't moved on. */
  const retry = useCallback(() => {
    const field = pending.current;
    if (!field || !root.current) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== heading.current) {
      pending.current = null;
      return;
    }
    if (field(root.current)) pending.current = null;
  }, []);

  return { root, heading, pane: state.pane, go, retry };
}
