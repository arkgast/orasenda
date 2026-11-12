import type { PresetEntry, Settings as SettingsValue } from "../../ipc/bindings";
import type { SectionId } from "./SettingsHeader";
import { themeLabel } from "./sections/General";
import { presetLabel } from "./sections/Timer";

export type Key = "theme" | "preset" | "notify";

export const KEY_SECTION: Record<Key, SectionId> = {
  theme: "general",
  preset: "timer",
  notify: "notifications",
};

export function changedKeys(sent: SettingsValue, restored: SettingsValue): Key[] {
  const keys: Key[] = [];
  if (sent.theme !== restored.theme) keys.push("theme");
  if (sent.presetId !== restored.presetId) keys.push("preset");
  if (sent.notifySessionEnd !== restored.notifySessionEnd) keys.push("notify");
  return keys;
}

/** `base` with the `keys` taken from `from`. */
export function withKeys(base: SettingsValue, from: SettingsValue, keys: Key[]): SettingsValue {
  const next = { ...base };
  for (const key of keys) {
    if (key === "theme") next.theme = from.theme;
    else if (key === "preset") next.presetId = from.presetId;
    else next.notifySessionEnd = from.notifySessionEnd;
  }
  return next;
}

export const FAILURE_NAME: Record<Key, { subject: string; verb: string; again: string }> = {
  theme: { subject: "Theme", verb: "wasn't", again: "theme" },
  preset: { subject: "Preset", verb: "wasn't", again: "preset" },
  notify: { subject: "Notifications", verb: "weren't", again: "notifications" },
};

export function backTo(key: Key, restored: SettingsValue, presets: PresetEntry[]): string {
  if (key === "theme") return themeLabel(restored.theme);
  if (key === "preset") return presetLabel(presets, restored);
  return restored.notifySessionEnd ? "on" : "off";
}
