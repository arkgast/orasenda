import { useEffect, useState } from "react";
import type { Preset, PresetLength, Settings } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";

const NAMES: Readonly<Record<Preset, string>> = {
  classic: "Classic",
  fifty_ten: "50/10",
  deep_block: "Deep Block",
  custom: "Custom",
  quick: "Just 2 minutes",
};

/** The name a person sees for a preset. */
export function presetName(preset: Preset): string {
  return NAMES[preset];
}

// presets_get is read once per launch: the three fixed presets never change. A failure is logged
// once and leaves the list empty (the summary then shows no minutes).
let cached: Promise<PresetLength[]> | null = null;
// The value once it arrived, so a later mount starts with it instead of one empty frame.
let resolved: PresetLength[] | null = null;

export function presetLengths(): Promise<PresetLength[]> {
  cached ??= commands.presetsGet().then(
    (list) => {
      resolved = list;
      return list;
    },
    (error: unknown) => {
      console.error("presets_get failed", error);
      resolved = [];
      return [] as PresetLength[];
    },
  );
  return cached;
}

/** Empties the cache (Vitest shares this module within a file). */
export function resetPresetsForTests(): void {
  cached = null;
  resolved = null;
}

/** The fixed presets' lengths, `[]` until they arrive. */
export function usePresetLengths(): PresetLength[] {
  const [lengths, setLengths] = useState<PresetLength[]>(() => resolved ?? []);
  useEffect(() => {
    let cancelled = false;
    presetLengths().then((list) => {
      if (!cancelled) setLengths(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return lengths;
}

/** The focus and break minutes of a preset; Custom comes from the saved settings. */
export function lengthOf(
  preset: Preset,
  settings: Settings | null,
  lengths: PresetLength[],
): { focusMin: number; breakMin: number } | undefined {
  if (preset === "custom") return settings?.custom;
  return lengths.find((entry) => entry.preset === preset);
}

export type SummaryInput = {
  state: "idle" | "running" | "paused";
  name: string;
  minutes: number | undefined;
  finish: string | null;
  /** A strip layout: the visible text leaves the minutes out. */
  strip: boolean;
};

export type SummaryText = { visible: string; short: string; name: string; tooltip: string };

/** The summary's text in every form (spec C, "Top row"). */
export function summaryText(input: SummaryInput): SummaryText {
  const { state, name, minutes, finish } = input;
  const mins = minutes === undefined ? null : `${minutes} min`;
  const ends = finish ? `ends ${finish}` : null;
  const showMins = state === "paused" || (state === "idle" && !input.strip);
  const showEnds = state !== "paused";
  const rest = [showMins ? mins : null, showEnds ? ends : null].filter(Boolean) as string[];
  const words = minutes === undefined ? null : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const spoken = [
    `Preset ${name}`,
    state === "running" ? null : words,
    state === "paused" ? "paused" : null,
    state === "running" ? null : ends,
    state === "running" ? ends : null,
  ].filter(Boolean);
  const action = state === "idle" ? "Change preset" : "Preset details";
  return {
    visible: [name, ...rest].join(" · "),
    short: rest.length > 0 ? rest.join(" · ") : name,
    name: `${spoken.join(", ")}. ${action}`,
    tooltip: action,
  };
}
