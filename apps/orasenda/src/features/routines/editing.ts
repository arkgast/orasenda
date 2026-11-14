import type { RoutinesError } from "@shared/ipc/bindings";

/** What an editor shows for one save: an error under a field, and the dialog's one live line. */
export type Errors<F extends string> = { fields: Partial<Record<F, string>>; line: string | null };

export const NO_ERRORS = { fields: {}, line: null } as const;

/** The limits Rust keeps (R5 ruling 5); the fields cap typing with `maxLength` at these. */
export const MAX_NAME = 80;
export const MAX_LONG = 120;

export const NAME_NEEDED = "Give it a name.";
export const SAVE_FAILED =
  "That change couldn't be saved. Your data is safe; try again in a moment.";
const RUNNING = "A routine is running. Save this when it ends.";

/** "At most 80 characters." */
export const atMost = (max: number): string => `At most ${max} characters.`;

/** Characters as Rust counts them (Unicode scalar values), not UTF-16 units. */
export const length = (text: string): number => Array.from(text.trim()).length;

/** The dialog line that goes with a field error: "Not saved yet. Check the name." */
export const checkLine = (label: string): string => `Not saved yet. Check the ${label}.`;

/**
 * The dialog line for a refusal that names no field. `full` and `notFound` depend on what is
 * being saved, so the editor words them; anything unknown is a failure to save.
 */
export function refusalLine(
  error: RoutinesError | "unreachable",
  words: { full: string; notFound: string },
): string {
  switch (error) {
    case "full":
      return words.full;
    case "notFound":
      return words.notFound;
    case "running":
      return RUNNING;
    default:
      return SAVE_FAILED;
  }
}

/** Minutes after midnight as the time field's value ("07:05"): the input's format, not a display. */
export function toFieldTime(minutes: number | null): string {
  if (minutes === null) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** The time field's value as minutes after midnight, or null when it holds no whole time. */
export function fromFieldTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}
