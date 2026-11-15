import { KEY } from "@domain/keyboard/glyphs";
import { describeShortcut, type ShortcutListItem } from "@orasenda/ui";

const ARROW = {
  left: String.fromCodePoint(0x2190),
  up: String.fromCodePoint(0x2191),
  right: String.fromCodePoint(0x2192),
  down: String.fromCodePoint(0x2193),
  delete: String.fromCodePoint(0x232b),
} as const;

const OPTION_COMMAND = `${KEY.option}${KEY.command}`;

type Entry = { action: string; keys: string; single?: boolean };

/** The Board's page keys and the Inbox's B (spec, Board page keys): fixed, not in the registry. */
const ENTRIES: readonly Entry[] = [
  { action: "Add task", keys: `${KEY.command}N` },
  {
    action: "Move to another column",
    keys: `${OPTION_COMMAND}${ARROW.left} ${OPTION_COMMAND}${ARROW.right}`,
  },
  {
    action: "Reorder in a column",
    keys: `${OPTION_COMMAND}${ARROW.up} ${OPTION_COMMAND}${ARROW.down}`,
  },
  { action: "Remove task", keys: `${KEY.command}${ARROW.delete}` },
  { action: "Make Frog", keys: "F", single: true },
  { action: "Open task", keys: KEY.enter },
  { action: "Start focus on task", keys: `${KEY.command}${KEY.enter}` },
  { action: "Move note to Board (Inbox)", keys: "B", single: true },
];

/** The read-only On the Board list; the single keys are marked off while single keys are off. */
export function boardShortcutItems(singleKey: boolean): ShortcutListItem[] {
  return ENTRIES.map(({ action, keys, single }) => ({
    action,
    keys,
    spokenKeys: keys
      .split(" ")
      .map((key) => describeShortcut(key).spoken)
      .join(", "),
    off: single && !singleKey ? true : undefined,
  }));
}
