import { useEffect, useRef } from "react";

/** Anything that takes Esc for itself: the palette, a dialog, an open menu or list. */
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], dialog[open], [role="menu"], [role="listbox"]';

/**
 * Esc leaves full screen, once, wherever focus is. An open overlay takes it first: the overlay is
 * looked for before any handler runs (capture), because the overlay closes on this same Esc and
 * would be gone by the time the bubble phase asks. A press the view itself already handled
 * (`FullScreenFocus` prevents it) is not handled again.
 */
export function useLeaveKey(leave: () => void) {
  const latest = useRef(leave);
  latest.current = leave;
  useEffect(() => {
    let overlay = false;
    const before = (event: KeyboardEvent) => {
      if (event.key === "Escape") overlay = document.querySelector(OVERLAY) !== null;
    };
    const after = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || overlay) return;
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
