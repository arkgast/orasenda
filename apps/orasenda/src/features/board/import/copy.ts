import type { ImportSourceKind } from "@shared/ipc/bindings";

export const SOURCE_COPY: Record<ImportSourceKind, { name: string; description: string }> = {
  reminders: {
    name: "Apple Reminders",
    description: "Reads your open reminders on this Mac.",
  },
  todoist: {
    name: "Todoist",
    description: "Pick a CSV or backup .zip you exported.",
  },
  things: {
    name: "Things",
    description: "Reads your open to-dos. Opens Things if needed.",
  },
};

export const STALE_LINE = "That preview is out of date. Choose the source again.";
export const SOURCES_FAILED_LINE =
  "Orasenda couldn't list the places to import from. Close this and try again.";
export const FAILED_LINE = "That didn't save. Try again.";
export const READ_FAILED_LINE = "Orasenda couldn't read that source. Try again.";
export const NO_SELECTION = "Select at least one task to import.";

export const tasks = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;
