import { useEffect, useRef } from "react";

/** Anything that takes Esc for itself: the palette, a dialog, an open menu or list. */
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], dialog[open], [role="menu"], [role="listbox"]';

/**
 * A window-level Esc for a running flow, for when focus sits outside its frame (a click on plain
 * text moves it there). A frame that handled Esc marks it handled, so the window sees it
 * `defaultPrevented` and does nothing twice. An overlay that is open takes the key first (looked
 * for in the capture phase, because the overlay closes on this same Esc).
 */
export function useEscFallback(leave: () => void): void {
  const latest = useRef(leave);
  latest.current = leave;
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
