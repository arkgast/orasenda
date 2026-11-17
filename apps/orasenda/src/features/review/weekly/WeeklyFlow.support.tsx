import type { WeeklyView_Serialize } from "@shared/ipc/bindings";
import {
  boardOf,
  boardTask,
  mockBackend,
  type Replies,
  settle,
  weeklyView,
} from "@shared/test/fixtures";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { WeeklyFlow } from "./WeeklyFlow";

export const BOARD = boardOf([
  boardTask("t1", "Fix sync bug", "doing"),
  boardTask("t2", "Write notes", "today"),
  boardTask("t3", "Call the bank", "backlog"),
  boardTask("t4", "Plan the offsite", "backlog"),
]);

/** The view `weekly_save` and `weekly_complete` answer with: the draft shown back, typed titles as new ids. */
export function answerOf(view: WeeklyView_Serialize, completed = false) {
  return (args: unknown): WeeklyView_Serialize => {
    const { draft } = args as {
      draft: {
        improvement: string | null;
        notes: string | null;
        priorities: Array<{ task?: string; newTitle?: string }>;
      };
    };
    const titles = new Map(BOARD.columns.flatMap((c) => c.tasks).map((t) => [t.id, t.title]));
    return {
      ...view,
      answers: {
        improvement: draft.improvement?.trim() || null,
        notes: draft.notes?.trim() || null,
        priorities: draft.priorities.map((pick, index) => {
          const taskId = pick.task ?? `new-${index}`;
          const title = pick.task ? (titles.get(pick.task) ?? pick.task) : (pick.newTitle ?? "");
          return { taskId, title, done: false, line: `${title} · Backlog` };
        }),
      },
      completedLine: completed ? "Week planned." : null,
    };
  };
}

/** Renders the weekly flow on the mocked backend and lets the first view land. */
export async function openWeekly(
  replies: Replies = {},
  view: WeeklyView_Serialize = weeklyView(),
) {
  const onClose = vi.fn();
  const backend = mockBackend({
    weekly_get: () => view,
    weekly_save: answerOf(view),
    weekly_complete: answerOf(view, true),
    board_get: () => BOARD,
    ...replies,
  });
  const result = render(<WeeklyFlow onClose={onClose} />);
  await settle();
  return { backend, onClose, ...result };
}

/** Presses the button the way a keyboard does: focus, then Return. */
export async function press(name: string | RegExp): Promise<void> {
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
  await settle();
}

export const heading = () => screen.getByRole("heading", { level: 1 });

/** The one polite region the flow owns. */
export const live = () => document.querySelector('[data-slot="flow-live"]');

export async function pressKey(key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
  });
}

/** Types a new title into the priority slot `n` (1 to 3) and adds it to Backlog. */
export async function addTyped(n: number, title: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: `Add priority ${n}` }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: title } });
  fireEvent.click(screen.getByRole("option", { name: `Add "${title}" to Backlog` }));
  await settle();
}

/** Picks an existing task into the priority slot `n`. */
export async function pickTask(n: number, query: string, title: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: `Add priority ${n}` }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(title) }));
  await settle();
}
