import type { PresetEntry, Settings as SettingsValue } from "@shared/ipc/bindings";
import type { SectionId } from "./SettingsHeader";
import { CAPS } from "./sections/CadenceRows";
import { themeLabel } from "./sections/General";
import { presetLabel } from "./sections/Timer";

/** The Timer cadence fields, each with its own failure line. */
export const CADENCE_KEYS = [
  "extensionCap",
  "autoContinue",
  "longestFocusMin",
  "deepCapOn",
  "deepCapHours",
] as const;

export type CadenceKey = (typeof CADENCE_KEYS)[number];

export type Key = "theme" | "preset" | CadenceKey | "notify" | "notifyTwo" | "singleKey";

export const KEY_SECTION: Record<Key, SectionId> = {
  theme: "general",
  preset: "timer",
  extensionCap: "timer",
  autoContinue: "timer",
  longestFocusMin: "timer",
  deepCapOn: "timer",
  deepCapHours: "timer",
  notify: "notifications",
  notifyTwo: "notifications",
  singleKey: "keyboard",
};

export function changedKeys(sent: SettingsValue, restored: SettingsValue): Key[] {
  const keys: Key[] = [];
  if (sent.theme !== restored.theme) keys.push("theme");
  if (sent.presetId !== restored.presetId) keys.push("preset");
  for (const field of CADENCE_KEYS) if (sent[field] !== restored[field]) keys.push(field);
  if (sent.notifySessionEnd !== restored.notifySessionEnd) keys.push("notify");
  if (sent.notifyTwoMinutes !== restored.notifyTwoMinutes) keys.push("notifyTwo");
  if (sent.singleKey !== restored.singleKey) keys.push("singleKey");
  return keys;
}

function isCadence(key: Key): key is CadenceKey {
  return (CADENCE_KEYS as readonly string[]).includes(key);
}

/** `base` with the `keys` taken from `from`. */
export function withKeys(base: SettingsValue, from: SettingsValue, keys: Key[]): SettingsValue {
  const next = { ...base };
  for (const key of keys) {
    if (key === "theme") next.theme = from.theme;
    else if (key === "preset") next.presetId = from.presetId;
    else if (isCadence(key)) Object.assign(next, { [key]: from[key] });
    else if (key === "singleKey") next.singleKey = from.singleKey;
    else if (key === "notifyTwo") next.notifyTwoMinutes = from.notifyTwoMinutes;
    else next.notifySessionEnd = from.notifySessionEnd;
  }
  return next;
}

export const FAILURE_NAME: Record<Key, { subject: string; verb: string; again: string }> = {
  theme: { subject: "Theme", verb: "wasn't", again: "theme" },
  preset: { subject: "Preset", verb: "wasn't", again: "preset" },
  extensionCap: { subject: "Extra 10 minutes", verb: "wasn't", again: "extra 10 minutes" },
  autoContinue: {
    subject: "Keep going automatically",
    verb: "wasn't",
    again: "keep going automatically",
  },
  longestFocusMin: { subject: "Longest focus", verb: "wasn't", again: "longest focus" },
  deepCapOn: { subject: "Deep-hours note", verb: "wasn't", again: "the deep-hours note" },
  deepCapHours: { subject: "Deep-hours cap", verb: "wasn't", again: "the deep-hours cap" },
  notify: { subject: "Notifications", verb: "weren't", again: "notifications" },
  singleKey: { subject: "Single-key shortcuts", verb: "weren't", again: "single-key shortcuts" },
  notifyTwo: { subject: "The two-minute note", verb: "wasn't", again: "the two-minute note" },
};

export function backTo(key: Key, restored: SettingsValue, presets: PresetEntry[]): string {
  if (key === "theme") return themeLabel(restored.theme);
  if (key === "preset") return presetLabel(presets, restored);
  if (key === "extensionCap")
    return (
      CAPS.find((cap) => cap.value === restored.extensionCap)?.said ?? String(restored.extensionCap)
    );
  if (key === "autoContinue") return restored.autoContinue ? "on" : "off";
  if (key === "deepCapOn") return restored.deepCapOn ? "on" : "off";
  if (key === "longestFocusMin") return `${restored.longestFocusMin} minutes`;
  if (key === "deepCapHours") return `${restored.deepCapHours} hours`;
  if (key === "singleKey") return restored.singleKey ? "on" : "off";
  return (key === "notifyTwo" ? restored.notifyTwoMinutes : restored.notifySessionEnd)
    ? "on"
    : "off";
}
