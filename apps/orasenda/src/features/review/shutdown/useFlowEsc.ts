import { useEffect, useRef } from "react";

/** Anything that takes Esc for itself: the palette, a dialog, an open menu or list. */
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], dialog[open], [role="menu"], [role="listbox"]';

/**
 * Esc ends the flow also when focus is outside the `FlowStep` (a click on plain text moves it
 * there). The frame handles Esc from inside and marks it handled, so the window sees it
 * `defaultPrevented` and does nothing twice. An overlay that is open takes the key first (looked
 * for in the capture phase, because the overlay closes on this same Esc). The same rule as the
 * run view's `useRunKeys`; a flow takes no single keys, so nothing else is bound.
 */
export function useFlowEsc(end: () => void): void {
  const latest = useRef(end);
  latest.current = end;
  useEffect(() => {
    let overlay = false;
    const before = (event: KeyboardEvent) => {
      if (event.key === "Escape") overlay = document.querySelector(OVERLAY) !== null;
    };
    const after = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || overlay || event.repeat) return;
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", before, true);
    window.addEventListener("keydown", after);
    return () => {
      window.removeEventListener("keydown", before, true);
      window.removeEventListener("keydown", after);
    };
  }, []);
}
