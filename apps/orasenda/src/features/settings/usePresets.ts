import { useRef, useState } from "react";
import type { PresetEntry, PresetError, PresetPatch } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import { BREAK_RANGE, FOCUS_RANGE } from "./customRange";

/** The editor's fields, named as the patch names them. */
export type EditField = "name" | "focusMin" | "breakMin" | "longBreakMin" | "rounds";

export const MAX_PRESETS = 12;

/** The allowed range of each number field. */
export const RANGE: Record<Exclude<EditField, "name">, [number, number]> = {
  focusMin: [FOCUS_RANGE.min, FOCUS_RANGE.max],
  breakMin: [BREAK_RANGE.min, BREAK_RANGE.max],
  longBreakMin: [5, 90],
  rounds: [1, 8],
};

const FIELD_FROM_RUST: Record<string, EditField> = {
  name: "name",
  focus_min: "focusMin",
  break_min: "breakMin",
  long_break_min: "longBreakMin",
  rounds: "rounds",
};

/** How each field is named in "<field> weren't saved". */
const FIELD_LABEL: Record<EditField, { text: string; verb: string }> = {
  name: { text: "The name", verb: "wasn't" },
  focusMin: { text: "Focus minutes", verb: "weren't" },
  breakMin: { text: "Break minutes", verb: "weren't" },
  longBreakMin: { text: "Long break minutes", verb: "weren't" },
  rounds: { text: "Long break after", verb: "wasn't" },
};

export type PresetLine = {
  text: string;
  undo?: { id: string; name: string };
  /** A failure: shown in the attention tone with Try again, which resends the same call. */
  retry?: () => void;
};
export type FieldErrors = Partial<Record<EditField, string>>;

function rangeText(field: Exclude<EditField, "name">, old: number): string {
  const [low, high] = RANGE[field];
  const unit = field === "rounds" ? "" : " minutes";
  return `Between ${low} and ${high}${unit}. Still using ${old}.`;
}

function summary(entry: PresetEntry): string {
  return `${entry.name} is now ${entry.focusMin} / ${entry.breakMin}, long ${entry.longBreakMin} after ${entry.rounds}`;
}

async function call<T>(
  run: () => Promise<{ status: "ok"; data: T } | { status: "error"; error: PresetError }>,
): Promise<{ ok: true; data: T } | { ok: false; error: PresetError | null }> {
  try {
    const result = await run();
    if (result.status === "ok") return { ok: true, data: result.data };
    return { ok: false, error: result.error };
  } catch (error) {
    console.error("a preset command failed", error);
    return { ok: false, error: null };
  }
}

/** Moves focus once React has drawn the answer, so it doesn't fall to the page when a control goes. */
function focusSoon(find: () => Element | null | undefined, tries = 10) {
  setTimeout(() => {
    const target = find() as HTMLElement | null | undefined;
    if (target) target.focus();
    else if (tries > 0) focusSoon(find, tries - 1);
  }, 0);
}

export type PresetEditing = ReturnType<typeof usePresetEditing>;

/**
 * Editing the library from Settings › Timer: which editor is open, the answer to the last
 * action (the page's save line) and the errors beside the editor's fields. The list itself
 * comes from `presets-changed`, never from these replies, so a late reply can't undo a newer one.
 */
export function usePresetEditing(
  presets: PresetEntry[],
  selectedId: string | undefined,
  /** Called when an action starts, so an older line from elsewhere on the page steps aside. */
  onStart: () => void = () => {},
) {
  const [editing, setEditing] = useState<string | null>(null);
  const [focusName, setFocusName] = useState(false);
  const [line, setLine] = useState<PresetLine | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const latest = useRef(presets);
  latest.current = presets;
  const turn = useRef(0);
  const begin = () => {
    onStart();
    return ++turn.current;
  };

  const open = (id: string | null, focus = false) => {
    setEditing(id);
    setFocusName(focus);
    setErrors({});
  };
  const setError = (field: EditField, text: string | undefined) =>
    setErrors((now) => ({ ...now, [field]: text }));
  /** Only the newest action writes the line. */
  const answer = (mine: number, next: PresetLine | null) => {
    if (mine === turn.current) setLine(next);
  };

  async function save(id: string, field: EditField, raw: string): Promise<boolean> {
    const old = latest.current.find((entry) => entry.id === id);
    if (!old) return false;
    let patch: PresetPatch;
    if (field === "name") {
      const name = raw.trim();
      if (name.length === 0) {
        setError(field, "A name needs at least one letter or number.");
        return false;
      }
      if ([...name].length > 40) {
        setError(field, `Up to 40 characters. Still using ${old.name}.`);
        return false;
      }
      patch = { name };
    } else {
      const [low, high] = RANGE[field];
      const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
      if (!(value >= low && value <= high)) {
        setError(field, rangeText(field, old[field]));
        return false;
      }
      patch = { [field]: value };
    }
    setError(field, undefined);
    const mine = begin();
    const result = await call(() => commands.presetUpdate(id, patch));
    if (result.ok) {
      answer(mine, { text: `Saved. ${summary(result.data)}.` });
      return true;
    }
    const kind = result.error?.kind;
    if (kind === "duplicateName") {
      setError(field, `Another preset has this name. Still using ${old.name}.`);
      answer(mine, null);
    } else if (kind === "invalid" && field !== "name") {
      const bad = FIELD_FROM_RUST[result.error?.field ?? ""] ?? field;
      if (bad !== "name") setError(bad, rangeText(bad, old[bad]));
      answer(mine, null);
    } else {
      const label = FIELD_LABEL[field];
      answer(mine, {
        text: `${label.text} ${label.verb} saved. Still using ${old[field]}.`,
        retry: () => void save(id, field, raw),
      });
    }
    return false;
  }

  async function add(): Promise<void> {
    const mine = begin();
    const result = await call(() => commands.presetAdd());
    if (result.ok) {
      open(result.data.id, true);
      answer(mine, { text: `Added ${result.data.name}.` });
    } else if (result.error?.kind === "limit") {
      answer(mine, { text: "Up to 12 presets." });
    } else {
      answer(mine, { text: "A new preset couldn't be added.", retry: () => void add() });
    }
  }

  async function remove(id: string): Promise<void> {
    const old = latest.current.find((entry) => entry.id === id);
    if (!old) return;
    const mine = begin();
    const result = await call(() => commands.presetRemove(id));
    if (result.ok) {
      setEditing((now) => (now === id ? null : now));
      const next = result.data[0];
      const moved = selectedId === id && next;
      answer(mine, {
        text: `Removed ${old.name}.${moved ? ` ${next.name} is selected.` : ""}`,
        undo: { id, name: old.name },
      });
      focusSoon(
        () =>
          [...document.querySelectorAll("button")].find(
            (b) => b.getAttribute("aria-label") === `Undo removing ${old.name}`,
          ) ?? document.querySelector<HTMLElement>('input[type="radio"]'),
      );
    } else if (result.error?.kind === "lastPreset") {
      answer(mine, { text: "At least one preset stays." });
    } else {
      answer(mine, { text: `${old.name} wasn't removed.`, retry: () => void remove(id) });
    }
  }

  async function undo(id: string, name: string): Promise<void> {
    const mine = begin();
    const result = await call(() => commands.presetUndoRemove(id));
    if (result.ok) {
      answer(mine, { text: `Brought back ${name}.` });
      focusSoon(() => document.getElementById(`preset-${id}-radio`));
    } else if (result.error?.kind === "duplicateName") {
      answer(mine, { text: "Another preset has this name now. Rename it first." });
    } else {
      answer(mine, {
        text: `${name} couldn't be brought back.`,
        retry: () => void undo(id, name),
      });
    }
  }

  async function restore(): Promise<void> {
    const mine = begin();
    const result = await call(() => commands.presetsRestoreDefaults());
    if (result.ok) {
      answer(mine, { text: "Default presets restored." });
    } else if (result.error?.kind === "duplicateName") {
      answer(mine, { text: "Another preset has a default's name. Rename it first." });
    } else {
      answer(mine, { text: "Default presets weren't restored.", retry: () => void restore() });
    }
  }

  const defaults = presets.filter((entry) => entry.isDefault);
  return {
    editing,
    focusName,
    line,
    errors,
    open,
    clearError: (field: EditField) => setError(field, undefined),
    clearLine: () => setLine(null),
    save,
    add,
    remove,
    undo,
    restore,
    canAdd: presets.length < MAX_PRESETS,
    canRemove: presets.length > 1,
    canRestore: defaults.length < 3 || defaults.some((entry) => entry.isChanged),
  };
}
