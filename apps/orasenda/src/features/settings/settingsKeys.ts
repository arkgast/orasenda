import type { Settings as SettingsValue } from "../../ipc/bindings";
import type { SectionId } from "./SettingsHeader";
import { themeLabel } from "./sections/General";
import { type Draft, presetLabel } from "./sections/Timer";

export type Key = "theme" | "preset" | "focus" | "break" | "notify";

export const KEY_SECTION: Record<Key, SectionId> = {
  theme: "general",
  preset: "timer",
  focus: "timer",
  break: "timer",
  notify: "notifications",
};

export function changedKeys(sent: SettingsValue, restored: SettingsValue): Key[] {
  const keys: Key[] = [];
  if (sent.theme !== restored.theme) keys.push("theme");
  if (sent.preset !== restored.preset) keys.push("preset");
  if (sent.custom.focusMin !== restored.custom.focusMin) keys.push("focus");
  if (sent.custom.breakMin !== restored.custom.breakMin) keys.push("break");
  if (sent.notifySessionEnd !== restored.notifySessionEnd) keys.push("notify");
  return keys;
}

/** `base` with the `keys` taken from `from`. */
export function withKeys(base: SettingsValue, from: SettingsValue, keys: Key[]): SettingsValue {
  const next = { ...base, custom: { ...base.custom } };
  for (const key of keys) {
    if (key === "theme") next.theme = from.theme;
    else if (key === "preset") next.preset = from.preset;
    else if (key === "focus") next.custom.focusMin = from.custom.focusMin;
    else if (key === "break") next.custom.breakMin = from.custom.breakMin;
    else next.notifySessionEnd = from.notifySessionEnd;
  }
  return next;
}

export const FAILURE_NAME: Record<Key, { subject: string; verb: string; again: string }> = {
  theme: { subject: "Theme", verb: "wasn't", again: "theme" },
  preset: { subject: "Preset", verb: "wasn't", again: "preset" },
  focus: { subject: "Focus minutes", verb: "weren't", again: "focus minutes" },
  break: { subject: "Break minutes", verb: "weren't", again: "break minutes" },
  notify: { subject: "Notifications", verb: "weren't", again: "notifications" },
};

export function backTo(key: Key, restored: SettingsValue): string {
  if (key === "theme") return themeLabel(restored.theme);
  if (key === "preset") return presetLabel(restored);
  if (key === "focus") return String(restored.custom.focusMin);
  if (key === "break") return String(restored.custom.breakMin);
  return restored.notifySessionEnd ? "on" : "off";
}

export function draftOf(custom: SettingsValue["custom"]): Draft {
  return { focus: String(custom.focusMin), break: String(custom.breakMin) };
}
