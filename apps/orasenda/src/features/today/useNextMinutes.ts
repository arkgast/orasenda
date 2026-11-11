import type { Settings } from "../../ipc/bindings";
import { lengthOf, usePresetLengths } from "./presets";

/**
 * The next session's focus length ("25 min") for the strip while idle. The three fixed presets
 * come from the once-per-launch cache; Custom comes from the saved settings. `undefined` until known.
 */
export function useNextMinutes(settings: Settings | null): string | undefined {
  const lengths = usePresetLengths();
  const minutes = lengthOf(settings?.preset ?? "classic", settings, lengths)?.focusMin;
  return minutes === undefined ? undefined : `${minutes} min`;
}
