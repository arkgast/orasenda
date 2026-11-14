import type { DataCounts, DataErrorKind, ImportReport } from "@shared/ipc/bindings";

const ORDER: ReadonlyArray<[keyof DataCounts, string, string]> = [
  ["sessions", "session", "sessions"],
  ["presets", "preset", "presets"],
  ["notes", "note", "notes"],
  ["settings", "setting", "settings"],
];
const SHOWN = 3;

function say(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a, b and c" (or just "a"). */
function list(parts: string[]): string {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The Stored row: sessions · presets · notes, zeros included. */
export function countsLine(counts: DataCounts | null | undefined): string {
  if (!counts) return "Unavailable until Orasenda can open its data.";
  return ORDER.slice(0, SHOWN)
    .map(([key, one, many]) => say(counts[key], one, many))
    .join(" · ");
}

function nonZero(counts: DataCounts): string[] {
  return ORDER.filter(([key]) => counts[key] > 0).map(([key, one, many]) =>
    say(counts[key], one, many),
  );
}

/** The import report: non-zero parts only, or "Nothing new in this file.". */
export function importLine(report: ImportReport): string {
  const sentences: string[] = [];
  const added = nonZero(report.added);
  const updated = nonZero(report.updated);
  if (added.length) sentences.push(`Added ${list(added)}.`);
  if (updated.length) sentences.push(`Updated ${list(updated)}.`);
  return sentences.length ? sentences.join(" ") : "Nothing new in this file.";
}

export function savedLine(file: string): string {
  return `Saved ${file}.`;
}

const ERRORS: Partial<Record<DataErrorKind, string>> = {
  busy: "End the session first.",
  newer: "This file was saved by a newer Orasenda. Update Orasenda to import it.",
  notOrasenda: "This file isn't Orasenda data.",
  unreadable: "Orasenda couldn't read this file.",
  write: "Orasenda couldn't write the file. Check there is space and try again.",
};

/** The line for a refused data command. */
export function errorLine(kind: DataErrorKind | null): string {
  return (kind && ERRORS[kind]) || "Orasenda couldn't do that. Try again.";
}
