import type { KeyboardError, ShortcutId } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { useRef, useState } from "react";
import { useKeyboardView } from "../../app/useKeyboardView";
import { toAccelerator } from "./shortcutKeys";

export const SHORTCUT_NAME: Record<ShortcutId, string> = {
  startPause: "Start or pause focus",
  capture: "Capture a thought",
};

type Errors = Record<ShortcutId, KeyboardError | null>;
const NONE: Errors = { startPause: null, capture: null };

function describe(error: unknown): KeyboardError {
  if (error === "invalid" || error === "inUseByOrasenda" || error === "unavailable") return error;
  return "store";
}

/**
 * The global shortcuts for Settings › Keyboard: `keyboard_state`, kept current by `keyboard-changed`,
 * and the two changes. Newest wins: a reply that a later change on the same shortcut has overtaken is
 * dropped, and the view only takes the reply of the latest change (the event brings the rest).
 * `onSaved` gets the save line ("Start or pause focus: ⌃⌥G.").
 */
export function useKeyboard(onSaved: (text: string) => void) {
  const { view, setView, loadFailed } = useKeyboardView();
  const [errors, setErrors] = useState<Errors>(NONE);
  const calls = useRef(0);
  const latest = useRef<Record<ShortcutId, number>>({ startPause: 0, capture: 0 });
  const saved = useRef(onSaved);
  saved.current = onSaved;

  function run(id: ShortcutId, call: () => ReturnType<typeof commands.keyboardSetShortcut>) {
    calls.current += 1;
    const mine = calls.current;
    latest.current[id] = mine;
    setErrors((current) => ({ ...current, [id]: null }));
    const fail = (error: KeyboardError) => {
      if (latest.current[id] === mine) setErrors((current) => ({ ...current, [id]: error }));
    };
    call().then(
      (result) => {
        if (result.status === "error") {
          fail(describe(result.error));
          return;
        }
        if (calls.current === mine) setView(result.data);
        if (latest.current[id] === mine) {
          saved.current(`${SHORTCUT_NAME[id]}: ${result.data[id].display ?? "off"}.`);
        }
      },
      (error: unknown) => {
        console.error("keyboard change failed", error);
        fail("store");
      },
    );
  }

  return {
    view,
    loadFailed,
    errors,
    /** `glyphs` is the recorder's output; `null` turns the shortcut off. */
    set(id: ShortcutId, glyphs: string | null) {
      const keys = glyphs === null ? null : toAccelerator(glyphs);
      if (glyphs !== null && keys === null) {
        latest.current[id] = ++calls.current;
        setErrors((current) => ({ ...current, [id]: "invalid" }));
        return;
      }
      run(id, () => commands.keyboardSetShortcut(id, keys));
    },
    restore(id: ShortcutId) {
      run(id, () => commands.keyboardRestoreDefault(id));
    },
  };
}
