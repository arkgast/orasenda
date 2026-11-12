import type { Settings } from "../../ipc/bindings";
import { selectedPreset, usePresets } from "./presets";

/**
 * The next session's focus length ("25 min") for the strip while idle, from the selected library
 * preset. `undefined` until the presets and the settings are known.
 */
export function useNextMinutes(settings: Settings | null): string | undefined {
  const presets = usePresets();
  const minutes = settings ? selectedPreset(presets, settings)?.focusMin : undefined;
  return minutes === undefined ? undefined : `${minutes} min`;
}
