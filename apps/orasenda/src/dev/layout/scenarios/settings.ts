import type { PresetEntry } from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { backend, DEEP, IDLE, PRESETS, SETTINGS } from "./backend";
import { rejects } from "./timer";

/** Twelve presets: the three defaults and nine of the person's own, one with the longest name. */
const TWELVE: PresetEntry[] = [
  ...PRESETS,
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `user-${i}`,
    name: i === 8 ? "A very long preset name of forty chars!!" : `Study block ${i + 1}`,
    focusMin: 40,
    breakMin: 10,
    longBreakMin: 30,
    rounds: 3,
    isDefault: false,
    isChanged: false,
  })),
];

export const SETTINGS_SCENARIOS: Record<string, Handler> = {
  settingsUnavailable: backend({ replies: { settings_get: rejects("unavailable", "no store") } }),
  deepWorkChecked: backend({ settings: { ...SETTINGS, presetId: DEEP } }),
  // Settings: a refused save (a preset no longer in the library) gives the preset's failure line.
  settingsInvalid: backend({ replies: { settings_set: rejects("invalidSpec", "out of range") } }),
  // Settings: twelve presets, so Add preset is at its limit.
  presetsTwelve: backend({ replies: { presets_list: () => TWELVE } }),
  // Settings: macOS has notifications off while the preference is on (the longest status line).
  notificationsDenied: backend({ view: { ...IDLE, notifications: "denied" } }),
};
