import type {
  ActionView,
  BindingView,
  FixedKeyView,
  KeyboardError,
  KeyboardView,
  Slot,
} from "@shared/ipc/bindings";
import { KEY } from "./glyphs";

/** What the lines read of a binding. `status` is there for an *Everywhere* binding. */
export type BindingLike = BindingView & { status?: "registered" | "off" | "failed" };

const ANOTHER_APP = "Another app uses this shortcut. Pick a different one.";
const VOICE_OVER = "VoiceOver uses Control-Option keys. You may want a different shortcut.";
const VOICE_OVER_COMMAND = "VoiceOver uses this key while it's on. Pick another to use both.";
const SINGLE_KEY = "A single key can't be a shortcut.";

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function errorLine(error: KeyboardError): string {
  if (error === "invalid") return "That isn't a shortcut Orasenda can use. Pick a different one.";
  if (error === "systemKeeps") return "macOS keeps this key, so it won't reach Orasenda.";
  if (error === "unavailable") return ANOTHER_APP;
  if (error === "store") return "Orasenda can't save this shortcut right now.";
  if (error.needsModifier) {
    const { command, control, option } = KEY;
    const add =
      error.needsModifier.slot === "app"
        ? `Add ${command} or ${control}.`
        : `Add ${command}, ${control} or ${option}.`;
    return `${add} ${SINGLE_KEY}`;
  }
  if (error.inUse)
    return `Orasenda uses this for ${lowerFirst(error.inUse.action)}. Pick a different one.`;
  return `${error.warning?.reason ?? ""} Use it everywhere anyway?`.trim();
}

/**
 * The line under a recorder, or null for none. The last error wins; then a repaired binding, a
 * shortcut another app holds, and, while VoiceOver is on, the note about Control-Option keys.
 */
export function bindingLine(
  error: KeyboardError | null,
  view: BindingLike,
  voiceOver: boolean,
): string | null {
  if (error) return errorLine(error);
  if (view.repaired) return "This shortcut was turned off because another action uses it.";
  if (view.status === "failed") return ANOTHER_APP;
  const parts = view.keys?.split("+") ?? [];
  if (voiceOver && parts.includes("Control") && parts.includes("Alt")) {
    return parts.includes("Super") ? VOICE_OVER_COMMAND : VOICE_OVER;
  }
  return null;
}

/**
 * The hint for a command: the *In Orasenda* keys, else the *Everywhere* keys while they work.
 * Null when the action has none to show.
 */
export function hintFor(action: ActionView | undefined): string | null {
  if (!action) return null;
  if (action.app.display) return action.app.display;
  return action.global.status === "registered" ? (action.global.display ?? null) : null;
}

/**
 * The binding a hint shows for an action: the *In Orasenda* one, else the *Everywhere* one while it
 * works (the same rule as `hintFor`), else nothing.
 */
export function shownBinding(action: ActionView | undefined): BindingView | undefined {
  if (!action) return undefined;
  if (action.app.display) return action.app;
  return action.global.status === "registered" && action.global.display ? action.global : undefined;
}

/** A registry single key as `useSingleKeys` names it: "Space", or a lower-case letter. */
export function singleKeyName(action: ActionView | undefined): string | null {
  const key = action?.singleKey;
  if (!key) return null;
  return key.length === 1 ? key.toLowerCase() : key;
}

export const SLOT_NAME: Record<Slot, string> = { app: "in Orasenda", global: "everywhere" };

/** `view` as the lists the webview reads. */
export function bindingsOf(view: KeyboardView | null) {
  return { actions: view?.actions ?? [], fixed: view?.fixed ?? [] };
}

/** The canonical accelerators of the fixed keys the webview shows hints for. */
export const FIXED_KEYS = {
  start: "Super+Enter",
  quick: "Shift+Super+Enter",
  end: "Super+Period",
  settings: "Super+Comma",
} as const;

/** The accelerator of page `n` (1 to 6) in the nav order. */
export const pageAccelerator = (n: number) => `Super+Digit${n}`;

/** The glyphs of the fixed key with `keys` (a canonical accelerator), or null before the registry answers. */
export function fixedDisplay(fixed: ReadonlyArray<FixedKeyView>, keys: string): string | null {
  return fixed.find((entry) => entry.keys === keys)?.display ?? null;
}

/** The pages' range hint, e.g. the first key's glyphs, an en dash and the last digit. */
export function pagesRange(fixed: ReadonlyArray<FixedKeyView>, count: number): string | null {
  const first = fixedDisplay(fixed, pageAccelerator(1));
  const last = fixedDisplay(fixed, pageAccelerator(count));
  if (!first || !last) return null;
  return `${first}${String.fromCodePoint(0x2013)}${last.slice(-1)}`;
}
