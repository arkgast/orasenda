import type { SettingsTarget } from "@shared/ipc/bindings";
import { presetEditButton } from "./PresetTable";
import type { PaneFocus } from "./usePaneFocus";

export type { SettingsTarget };

/** A visit to the page: a new `seq` is a new arrival (focus moves); `target` says where. */
export type Arrival = { seq: number; target?: SettingsTarget };

/** The *Keep going automatically* checkbox's id (CadenceRows). */
const KEEP_GOING_ID = "keep-going-auto";

/**
 * Brings the "Keep going" row into view and focuses its checkbox. False when the row isn't on
 * the page, so the caller can fall back to the pane heading.
 */
export function focusKeepGoing(root: HTMLElement): boolean {
  const box = root.querySelector<HTMLInputElement>(`#${KEEP_GOING_ID}`);
  if (!box || box.disabled) return false;
  box.closest('[data-slot="settings-row"]')?.scrollIntoView?.({ block: "center" });
  box.focus({ preventScroll: true });
  return true;
}

/** Focuses the Edit button of the selected preset. False before the presets and settings load. */
export function focusSelectedPresetEdit(root: HTMLElement): boolean {
  const radio = root.querySelector<HTMLInputElement>('input[id^="preset-"][id$="-radio"]:checked');
  const edit = radio
    ? presetEditButton(root, radio.id.slice("preset-".length, -"-radio".length))
    : null;
  if (!edit) return false;
  edit.focus();
  return true;
}

/** Where focus goes when a target opens its pane. */
export function focusFor(target: SettingsTarget): PaneFocus {
  if (target === "keepGoing") return focusKeepGoing;
  if (target === "focusMinutes" || target === "breakMinutes") return focusSelectedPresetEdit;
  return "heading";
}
