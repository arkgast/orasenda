import type { Handler } from "./backend";
import { backend } from "./backend";
import { board, task, week } from "./boardData";

export const BOARD_IMPORT_SCENARIOS: Record<string, Handler> = {};

// The import sheet on the Board: three sources and a Reminders preview long enough to scroll,
// with the cap line and a row that is already on the Board.
const items = Array.from({ length: 40 }, (_, key) => ({
  key,
  title: `Reminder ${key + 1}, worded at some length so it wraps on a narrow sheet`,
  meta: "Home · Errands · Due Fri 20 Nov",
  why: key === 3 ? "Already on the Board, in Today" : null,
  selected: key !== 3,
  onBoard: null,
}));

BOARD_IMPORT_SCENARIOS.boardImport = backend({
  replies: {
    board_get: () => board(week()),
    task_add: () => task("new", "New", "backlog"),
    import_sources: () => ({
      sources: [
        { kind: "reminders", available: true, reason: null },
        { kind: "todoist", available: true, reason: null },
        { kind: "things", available: true, reason: null },
      ],
    }),
    import_preview: () => ({
      picked: {
        id: 1,
        source: "reminders",
        sourceName: "Reminders",
        items,
        total: 812,
        line: null,
        summary: ["Showing 40 of 812. Import these, then choose Import tasks again for the rest."],
      },
    }),
    import_discard: () => null,
    task_import: () => ({ importId: 1, count: 39 }),
    task_import_undo: () => 39,
  },
});
