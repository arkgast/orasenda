import { useEffect, useRef } from "react";

/** Keys are `Space` or a lower-case letter. */
export type SingleKeyMap = Record<string, () => void>;

const HEADING = /^H[1-6]$/;

const CONTROL =
  'input, textarea, select, button, a[href], [contenteditable], [role="button"], [role="textbox"], [role="menuitem"], [role="option"], [role="combobox"]';
const POPUP = '[role="menu"], [role="dialog"], [role="alertdialog"]';

/**
 * Focus is "at rest": on the page itself, on a heading, or on a page container that only holds
 * focus programmatically (tabindex below zero, not a control). Never in a field, a control or a popup.
 */
function atRest(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const page = target === document.body || target === document.documentElement;
  const heading = HEADING.test(target.tagName) || target.getAttribute("role") === "heading";
  const holder = target.tabIndex < 0 && target.hasAttribute("tabindex") && !target.matches(CONTROL);
  if (!(page || heading || holder)) return false;
  return document.querySelector(POPUP) === null;
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
