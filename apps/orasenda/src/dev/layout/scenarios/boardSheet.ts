import type { Handler } from "./backend";
import { backend } from "./backend";
import { board, task } from "./boardData";

export const BOARD_SHEET_SCENARIOS: Record<string, Handler> = {};

// The task sheet at its fullest: 8 tags, 14 checklist items and long notes. The task keeps the name
// "Write the intro" so the sheet specs open it the same way as in boardWeek.
const full = () =>
  task("t1", "Write the intro", "today", {
    estimate: 2,
    planned: 3,
    dueLabel: "Due Fri 20 Nov",
    priority: "high",
    tags: ["writing", "client", "draft", "review", "chapter-one", "research", "outline", "edits"],
    notes: "A long note that keeps going, with plenty to say about the intro. ".repeat(24).trim(),
    checklist: Array.from({ length: 14 }, (_, i) => ({
      id: `c${i}`,
      text: `Checklist step ${i + 1}, worded at some length so it wraps on a narrow sheet`,
      done: i % 3 === 0,
    })),
  });

BOARD_SHEET_SCENARIOS.boardFullTask = backend({ replies: { board_get: () => board([full()]) } });

// Every save is turned down, so the sheet shows its failure line.
BOARD_SHEET_SCENARIOS.boardSaveFails = backend({
  replies: {
    board_get: () => board([full()]),
    task_update: () => Promise.reject("store"),
  },
});
