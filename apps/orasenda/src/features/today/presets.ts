import type { BreakKind, PresetEntry, Settings } from "@shared/ipc/bindings";
import { commands, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useEffect, useState } from "react";

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
// Bumped by every presets-changed event, so a presets_list reply that left before the event and
// arrives after it cannot replace the newer list.
let generation = 0;
let failed = false;
const watchers = new Set<(list: PresetEntry[]) => void>();
let stopChanged: (() => void) | null = null;

function ensureSubscribed(): void {
  if (stopChanged) return;
  stopChanged = subscribe("presets-changed", events.presetsChanged.listen, (list) => {
    generation += 1;
    failed = false;
    resolved = list;
    cached = Promise.resolve(list);
    for (const watcher of watchers) watcher(list);
  });
}

export function presetsList(): Promise<PresetEntry[]> {
  ensureSubscribed();
  if (cached) return cached;
  const started = generation;
  cached = commands.presetsList().then(
    (list) => {
      if (started !== generation) return resolved ?? list;
      resolved = list;
      return list;
    },
    (error: unknown) => {
      if (started !== generation) return resolved ?? [];
      console.error("presets_list failed", error);
      failed = true;
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
  generation = 0;
  failed = false;
  stopChanged?.();
  stopChanged = null;
  watchers.clear();
}

/** True once presets_list failed and no presets-changed has followed. */
export function usePresetsFailed(): boolean {
  const [value, setValue] = useState(failed);
  useEffect(() => {
    let cancelled = false;
    presetsList().then(() => {
      if (!cancelled) setValue(failed);
    });
    const watcher = () => setValue(failed);
    watchers.add(watcher);
    return () => {
      cancelled = true;
      watchers.delete(watcher);
    };
  }, []);
  return value;
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

export type PresetChoice = { presetId: string; label: string; meta: string; checked: boolean };

/**
 * The preset rows of the popover (Today and the Focus window): every live preset in order, the
 * saved one checked (the first when the saved id is not in the list, as `selectedPreset`).
 */
export function presetChoices(settings: Settings, presets: PresetEntry[]): PresetChoice[] {
  const saved = selectedPreset(presets, settings)?.id;
  return presets.map((entry) => ({
    presetId: entry.id,
    label: presetName(entry),
    meta: presetMeta(entry),
    checked: entry.id === saved,
  }));
}

export type SummaryInput = {
  state: "idle" | "running" | "paused";
  name: string;
  minutes: number | undefined;
  finish: string | null;
  /** A strip layout: the visible text leaves the minutes out. */
  strip: boolean;
  /** Which break is running; `null` outside a break. */
  breakKind?: BreakKind | null;
};

export type SummaryText = { visible: string; short: string; name: string; tooltip: string };

/** The summary's text in every form (spec C, "Top row"). */
export function summaryText(input: SummaryInput): SummaryText {
  const { state, name, minutes, finish } = input;
  // In a break the summary names the break, not the focus's minutes.
  const breakWord = input.breakKind ? (input.breakKind === "long" ? "long break" : "break") : null;
  const mins = minutes === undefined || breakWord ? null : `${minutes} min`;
  const ends = finish ? `ends ${finish}` : null;
  const showMins = state === "paused" || (state === "idle" && !input.strip);
  const showEnds = state !== "paused";
  const rest = [breakWord, showMins ? mins : null, showEnds ? ends : null].filter(
    Boolean,
  ) as string[];
  const words =
    minutes === undefined || breakWord
      ? null
      : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const spoken = [
    `Preset ${name}`,
    breakWord,
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
