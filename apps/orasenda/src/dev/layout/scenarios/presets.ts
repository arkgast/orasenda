import type { PresetEntry } from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { backend, PRESETS } from "./backend";

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

/** One preset with a long name: the narrowest row the table can have. */
const ONE: PresetEntry[] = [
  { ...(PRESETS[1] as PresetEntry), name: "A very long preset name of forty chars!!" },
];

export const PRESET_SCENARIOS: Record<string, Handler> = {
  // Settings: twelve presets, so Add preset is at its limit.
  presetsTwelve: backend({ replies: { presets_list: () => TWELVE } }),
  // Settings: one preset, so Remove is off.
  presetsOne: backend({ replies: { presets_list: () => ONE } }),
};
