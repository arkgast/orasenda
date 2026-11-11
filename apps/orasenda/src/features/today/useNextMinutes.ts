import { useEffect, useState } from "react";
import type { Preset, PresetLength, Settings } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";

/**
 * The next session's focus length ("25 min") for the strip while idle. The three fixed presets
 * come from Rust once per mount; Custom comes from the saved settings. `undefined` until known.
 */
export function useNextMinutes(settings: Settings | null): string | undefined {
  const [lengths, setLengths] = useState<PresetLength[]>([]);

  useEffect(() => {
    let cancelled = false;
    commands.presetsGet().then(
      (list) => {
        if (!cancelled) setLengths(list);
      },
      (error: unknown) => console.error("presets_get failed", error),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const preset: Preset = settings?.preset ?? "classic";
  const minutes =
    preset === "custom"
      ? settings?.custom.focusMin
      : lengths.find((entry) => entry.preset === preset)?.focusMin;
  return minutes === undefined ? undefined : `${minutes} min`;
}
