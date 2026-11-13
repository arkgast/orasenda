import { useEffect, useRef, useState } from "react";
import type { KeyboardError, KeyboardView, ShortcutId } from "../../ipc/bindings";
import { commands, events } from "../../ipc/bindings";
import { subscribe } from "../../ipc/subscribe";
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
  const [view, setView] = useState<KeyboardView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errors, setErrors] = useState<Errors>(NONE);
  const calls = useRef(0);
  const latest = useRef<Record<ShortcutId, number>>({ startPause: 0, capture: 0 });
  const saved = useRef(onSaved);
  saved.current = onSaved;

  useEffect(() => {
    let live = true;
    const stop = subscribe("keyboard-changed", events.keyboardChanged.listen, (next) => {
      setLoadFailed(false);
      setView(next);
    });
    commands.keyboardState().then(
      (first) => {
        // An event that already arrived is newer than this first read.
        if (live) setView((current) => current ?? first);
      },
      (error: unknown) => {
        console.error("keyboard_state failed", error);
        if (live) setLoadFailed(true);
      },
    );
    return () => {
      live = false;
      stop();
    };
  }, []);

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
