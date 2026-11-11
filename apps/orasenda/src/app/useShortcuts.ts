import { useEffect, useRef } from "react";

export type Binding = {
  /** `KeyboardEvent.key`, such as "1" or "Enter". */
  key: string;
  meta: true;
  shift?: boolean;
  /** Whether the shortcut is live right now. */
  when(): boolean;
  run(): void;
};

const NON_TEXT_INPUTS = new Set([
  "radio",
  "checkbox",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
]);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return (
    target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * In-app ⌘ shortcuts. A binding runs, and the key is kept from the page, only when it matches,
 * its `when` holds, the target is not editable and no composition is going on. Anything else is
 * left alone, so typing and the system's own keys are not touched.
 */
export function useShortcuts(bindings: ReadonlyArray<Binding>): void {
  const latest = useRef(bindings);
  latest.current = bindings;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isEditable(event.target)) return;
      if (!event.metaKey || event.ctrlKey || event.altKey) return;
      const hit = latest.current.find(
        (b) => b.key === event.key && event.shiftKey === (b.shift ?? false) && b.when(),
      );
      if (!hit) return;
      event.preventDefault();
      hit.run();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
