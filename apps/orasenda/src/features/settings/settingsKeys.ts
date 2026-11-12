import type { PresetEntry, Settings as SettingsValue } from "../../ipc/bindings";
import type { SectionId } from "./SettingsHeader";
import { themeLabel } from "./sections/General";
import { presetLabel } from "./sections/Timer";

export type Key = "theme" | "preset" | "cadence" | "notify" | "notifyTwo";

export const KEY_SECTION: Record<Key, SectionId> = {
  theme: "general",
  preset: "timer",
  cadence: "timer",
  notify: "notifications",
  notifyTwo: "notifications",
};

const CADENCE_FIELDS = [
  "extensionCap",
  "autoContinue",
  "longestFocusMin",
  "deepCapOn",
  "deepCapHours",
] as const;

export function changedKeys(sent: SettingsValue, restored: SettingsValue): Key[] {
  const keys: Key[] = [];
  if (sent.theme !== restored.theme) keys.push("theme");
  if (sent.presetId !== restored.presetId) keys.push("preset");
  if (CADENCE_FIELDS.some((field) => sent[field] !== restored[field])) keys.push("cadence");
  if (sent.notifySessionEnd !== restored.notifySessionEnd) keys.push("notify");
  if (sent.notifyTwoMinutes !== restored.notifyTwoMinutes) keys.push("notifyTwo");
  return keys;
}

function pick(from: SettingsValue): Partial<SettingsValue> {
  return Object.fromEntries(CADENCE_FIELDS.map((field) => [field, from[field]]));
}

/** `base` with the `keys` taken from `from`. */
export function withKeys(base: SettingsValue, from: SettingsValue, keys: Key[]): SettingsValue {
  const next = { ...base };
  for (const key of keys) {
    if (key === "theme") next.theme = from.theme;
    else if (key === "preset") next.presetId = from.presetId;
    else if (key === "cadence") Object.assign(next, pick(from));
    else if (key === "notifyTwo") next.notifyTwoMinutes = from.notifyTwoMinutes;
    else next.notifySessionEnd = from.notifySessionEnd;
  }
  return next;
}

export const FAILURE_NAME: Record<Key, { subject: string; verb: string; again: string }> = {
  theme: { subject: "Theme", verb: "wasn't", again: "theme" },
  preset: { subject: "Preset", verb: "wasn't", again: "preset" },
  cadence: { subject: "Session options", verb: "weren't", again: "session options" },
  notify: { subject: "Notifications", verb: "weren't", again: "notifications" },
  notifyTwo: { subject: "The two-minute note", verb: "wasn't", again: "the two-minute note" },
};

export function backTo(key: Key, restored: SettingsValue, presets: PresetEntry[]): string {
  if (key === "theme") return themeLabel(restored.theme);
  if (key === "preset") return presetLabel(presets, restored);
  if (key === "cadence") return "what was saved";
  return (key === "notifyTwo" ? restored.notifyTwoMinutes : restored.notifySessionEnd)
    ? "on"
    : "off";
}
