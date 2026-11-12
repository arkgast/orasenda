import { useEffect, useState } from "react";
import type { PresetEntry, Settings } from "../../ipc/bindings";
import { commands, events } from "../../ipc/bindings";
import { subscribe } from "../../ipc/subscribe";

/** The name a person sees for a library preset. */
export function presetName(entry: Pick<PresetEntry, "name">): string {
  return entry.name;
}

/** "25 / 5": focus and break minutes, the meta of a preset in the popover and the tray. */
export function presetMeta(entry: Pick<PresetEntry, "focusMin" | "breakMin">): string {
  return `${entry.focusMin} / ${entry.breakMin}`;
}

// presets_list is read once per launch; presets-changed then keeps it current. A failure is
// logged once and leaves the list empty (the summary then shows no minutes).
let cached: Promise<PresetEntry[]> | null = null;
// The value once it arrived, so a later mount starts with it instead of one empty frame.
let resolved: PresetEntry[] | null = null;
const watchers = new Set<(list: PresetEntry[]) => void>();
let stopChanged: (() => void) | null = null;

function ensureSubscribed(): void {
  if (stopChanged) return;
  stopChanged = subscribe("presets-changed", events.presetsChanged.listen, (list) => {
    resolved = list;
    cached = Promise.resolve(list);
    for (const watcher of watchers) watcher(list);
  });
}

export function presetsList(): Promise<PresetEntry[]> {
  ensureSubscribed();
  cached ??= commands.presetsList().then(
    (list) => {
      resolved = list;
      return list;
    },
    (error: unknown) => {
      console.error("presets_list failed", error);
      resolved = [];
      return [] as PresetEntry[];
    },
  );
  return cached;
}

/** Empties the cache (Vitest shares this module within a file). */
export function resetPresetsForTests(): void {
  cached = null;
  resolved = null;
  stopChanged?.();
  stopChanged = null;
  watchers.clear();
}

/** The live presets in order, `[]` until they arrive; follows `presets-changed`. */
export function usePresets(): PresetEntry[] {
  const [presets, setPresets] = useState<PresetEntry[]>(() => resolved ?? []);
  useEffect(() => {
    let cancelled = false;
    const watcher = (list: PresetEntry[]) => {
      if (!cancelled) setPresets(list);
    };
    watchers.add(watcher);
    presetsList().then(watcher);
    return () => {
      cancelled = true;
      watchers.delete(watcher);
    };
  }, []);
  return presets;
}

/**
 * The preset the settings select: the one whose id matches, or the first live preset when the id
 * is not in the list (Rust presents the same fallback). `undefined` for an empty list.
 */
export function selectedPreset(
  presets: PresetEntry[],
  settings: Pick<Settings, "presetId"> | null,
): PresetEntry | undefined {
  return presets.find((entry) => entry.id === settings?.presetId) ?? presets[0];
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
