import { SLOT_NAME } from "@domain/keyboard/bindings";
import { useKeyboardView } from "@domain/keyboard/useKeyboardView";
import type { ActionId, KeyboardError, KeyboardView, Slot } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { useRef, useState } from "react";
import { toAccelerator } from "./shortcutKeys";

/** Until H5, Settings shows the two rows it always had, with both slots each. */
export type ShortcutId = Extract<ActionId, "startPause" | "capture">;

export const SHORTCUT_ROWS: ReadonlyArray<ShortcutId> = ["startPause", "capture"];

type Where = `${ShortcutId}.${Slot}`;
const where = (id: ShortcutId, slot: Slot): Where => `${id}.${slot}`;

/** The save line: "Start or pause focus: ⌃⌥G." (*Everywhere*) or "Start or pause focus in Orasenda: ⌘U.". */
function savedLine(view: KeyboardView, id: ShortcutId, slot: Slot): string {
  const action = view.actions.find((a) => a.id === id);
  const label = action?.label ?? id;
  const name = slot === "app" ? ` ${SLOT_NAME.app}` : "";
  return `${label}${name}: ${action?.[slot].display ?? "off"}.`;
}

type Errors = Partial<Record<Where, KeyboardError | null>>;

function describe(error: unknown): KeyboardError {
  if (error === "invalid" || error === "unavailable" || error === "systemKeeps") return error;
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    const inUse = e.inUse as Record<string, unknown> | undefined;
    const warning = e.warning as Record<string, unknown> | undefined;
    const needs = e.needsModifier as Record<string, unknown> | undefined;
    if (inUse && typeof inUse === "object" && typeof inUse.action === "string") {
      return error as KeyboardError;
    }
    if (warning && typeof warning === "object" && typeof warning.reason === "string") {
      return error as KeyboardError;
    }
    if (needs && typeof needs === "object" && (needs.slot === "app" || needs.slot === "global")) {
      return error as KeyboardError;
    }
  }
  return "store";
}

/**
 * The shortcuts for Settings › Keyboard: `keyboard_state`, kept current by `keyboard-changed`, and the
 * changes. Newest wins: a reply that a later change on the same slot has overtaken is dropped, and the
 * view only takes the reply of the latest change (the event brings the rest). `onSaved` gets the save line.
 * A `warning` error waits for the person: `confirmAnyway` sends the same keys again, confirmed, and
 * `pickAnother` drops the question.
 */
export function useKeyboard(onSaved: (text: string) => void) {
  const { view, setView, loadFailed } = useKeyboardView();
  const [errors, setErrors] = useState<Errors>({});
  const calls = useRef(0);
  const latest = useRef<Partial<Record<Where, number>>>({});
  const tried = useRef<Partial<Record<Where, string | null>>>({});
  const saved = useRef(onSaved);
  saved.current = onSaved;

  function run(
    id: ShortcutId,
    slot: Slot,
    call: () => ReturnType<typeof commands.keyboardSetBinding>,
  ) {
    const at = where(id, slot);
    calls.current += 1;
    const mine = calls.current;
    latest.current[at] = mine;
    setErrors((current) => ({ ...current, [at]: null }));
    const fail = (error: KeyboardError) => {
      if (latest.current[at] === mine) setErrors((current) => ({ ...current, [at]: error }));
    };
    call().then(
      (result) => {
        if (result.status === "error") {
          fail(describe(result.error));
          return;
        }
        if (calls.current === mine) setView(result.data);
        if (latest.current[at] === mine) saved.current(savedLine(result.data, id, slot));
      },
      (error: unknown) => {
        console.error("keyboard change failed", error);
        fail("store");
      },
    );
  }

  function send(id: ShortcutId, slot: Slot, keys: string | null, confirm: boolean) {
    tried.current[where(id, slot)] = keys;
    run(id, slot, () => commands.keyboardSetBinding(id, slot, keys, confirm));
  }

  return {
    view,
    loadFailed,
    errors,
    /** `glyphs` is the recorder's output; `null` turns the shortcut off. */
    set(id: ShortcutId, slot: Slot, glyphs: string | null) {
      const keys = glyphs === null ? null : toAccelerator(glyphs);
      if (glyphs !== null && keys === null) {
        latest.current[where(id, slot)] = ++calls.current;
        setErrors((current) => ({ ...current, [where(id, slot)]: "invalid" }));
        return;
      }
      send(id, slot, keys, false);
    },
    restore(id: ShortcutId, slot: Slot) {
      run(id, slot, () => commands.keyboardRestoreDefault(id, slot));
    },
    confirmAnyway(id: ShortcutId, slot: Slot) {
      const keys = tried.current[where(id, slot)];
      if (keys === undefined) {
        console.error("keyboard confirm without tried keys", where(id, slot));
        return;
      }
      send(id, slot, keys, true);
    },
    pickAnother(id: ShortcutId, slot: Slot) {
      latest.current[where(id, slot)] = ++calls.current;
      setErrors((current) => ({ ...current, [where(id, slot)]: null }));
    },
  };
}
