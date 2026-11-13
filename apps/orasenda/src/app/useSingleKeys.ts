import { useEffect, useRef } from "react";

/** Keys are `Space` or a lower-case letter. */
export type SingleKeyMap = Record<string, () => void>;

const HEADING = /^H[1-6]$/;

/** Focus is "at rest": on the page itself or on a heading, not in a field, a control or a popup. */
function atRest(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.body || target === document.documentElement) {
    return document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]') === null;
  }
  if (!(HEADING.test(target.tagName) || target.getAttribute("role") === "heading")) return false;
  return document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]') === null;
}

/**
 * Single-key shortcuts (Space or a letter) for a page. A key in `map` runs, and is kept from the
 * page, only while `enabled`, focus is on the body or a heading, no menu or dialog is open, and
 * the key has no modifier and is not a repeat. Anything else is left alone, so typing and
 * the controls' own keys are untouched.
 */
export function useSingleKeys(map: SingleKeyMap, enabled: boolean): void {
  const latest = useRef(map);
  latest.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!atRest(event.target)) return;
      const name = event.key === " " ? "Space" : event.key.toLowerCase();
      const run = Object.hasOwn(latest.current, name) ? latest.current[name] : undefined;
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
