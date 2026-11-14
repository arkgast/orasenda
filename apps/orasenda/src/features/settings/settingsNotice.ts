import type { PresetEntry, Settings as SettingsValue } from "@shared/ipc/bindings";
import { backTo, FAILURE_NAME, type Key, withKeys } from "./settingsKeys";
import type { PresetEditing } from "./usePresets";

export const REST = "Changes save as you make them.";
export const WRITE_REASON = "Orasenda can't write its data file.";
export const READ_ONLY = "Read-only until you update Orasenda.";

export type Line =
  | { kind: "rest" }
  | {
      kind: "failed";
      sent: SettingsValue;
      restored: SettingsValue;
      cause: "write" | "unavailable";
      keys: Key[];
    };

export type Notice = {
  text: string;
  tone: "neutral" | "attention" | "rest";
  action?: { label: string; name: string; run: () => void };
};

type Inputs = {
  readOnly: boolean;
  line: Line;
  store: "ok" | "unavailable" | "newer";
  presets: PresetEntry[];
  editorLine: PresetEditing["line"];
  undo(id: string, name: string): void;
  savedLine: string | null;
  loadFailed: boolean;
  /** The settings shown so far: null until the first settings_get answers. */
  settings: SettingsValue | null;
  latest(): SettingsValue | null;
  change(next: SettingsValue): void;
};

const UNAVAILABLE =
  "Orasenda can't save settings right now. Changes you make here may not be kept.";

/** The save line: what the last action did, in order of what matters most. */
export function buildNotice(i: Inputs): Notice {
  if (i.readOnly) {
    return {
      text: "This data was saved by a newer Orasenda. Settings are read-only until you update.",
      tone: "attention",
    };
  }
  const { line } = i;
  if (line.kind === "failed") {
    const resend = () => {
      const base = i.latest();
      if (base) i.change(withKeys(base, line.sent, line.keys));
    };
    if (i.store === "unavailable" && line.cause === "unavailable") {
      return {
        text: UNAVAILABLE,
        tone: "attention",
        action: { label: "Try again", name: "Try again saving", run: resend },
      };
    }
    const [only, ...more] = line.keys;
    if (only && more.length === 0) {
      const name = FAILURE_NAME[only];
      return {
        text: `${name.subject} ${name.verb} saved. Back to ${backTo(only, line.restored, i.presets)}.`,
        tone: "attention",
        action: { label: "Try again", name: `Try again saving ${name.again}`, run: resend },
      };
    }
    return {
      text: "Your last changes weren't saved. Settings are back to what was saved.",
      tone: "attention",
      action: { label: "Try again", name: "Try again saving your changes", run: resend },
    };
  }
  if (i.editorLine) {
    const { text, undo, retry } = i.editorLine;
    const action = undo
      ? {
          label: "Undo",
          name: `Undo removing ${undo.name}`,
          run: () => i.undo(undo.id, undo.name),
        }
      : retry
        ? { label: "Try again", name: "Try again", run: retry }
        : undefined;
    return { text, tone: retry ? "attention" : "neutral", action };
  }
  if (i.savedLine) return { text: i.savedLine, tone: "neutral" };
  if (i.loadFailed && !i.settings) {
    return { text: "Orasenda can't read settings right now.", tone: "attention" };
  }
  if (i.store === "unavailable") return { text: UNAVAILABLE, tone: "attention" };
  return { text: REST, tone: "rest" };
}
