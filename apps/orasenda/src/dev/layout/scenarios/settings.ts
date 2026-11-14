import type { Handler } from "./backend";
import { backend, DEEP, IDLE, SETTINGS } from "./backend";
import { PRESET_SCENARIOS } from "./presets";
import { rejects } from "./timer";

export const SETTINGS_SCENARIOS: Record<string, Handler> = {
  settingsUnavailable: backend({ replies: { settings_get: rejects("unavailable", "no store") } }),
  deepWorkChecked: backend({ settings: { ...SETTINGS, presetId: DEEP } }),
  // Settings: a refused save (a preset no longer in the library) gives the preset's failure line.
  settingsInvalid: backend({ replies: { settings_set: rejects("invalidSpec", "out of range") } }),
  ...PRESET_SCENARIOS,
  // Settings: macOS has notifications off while the preference is on (the longest status line).
  notificationsDenied: backend({ view: { ...IDLE, notifications: "denied" } }),
};
