import { commandFailure } from "@domain/timer/commandFailure";
import { type ColumnView, commands, type Lane, type TaskView } from "@shared/ipc/bindings";
import { useCallback, useEffect, useRef, useState } from "react";
import { locate } from "./lanes";
import type { useBoard } from "./useBoard";

/** How long a line with Undo stays, unless the next action replaces it. */
export const LINE_MS = 10_000;

export type BoardLine = {
  text: string;
  tone: "neutral" | "attention";
  action?: { label: string; name: string; run: () => void };
} | null;

type Api = ReturnType<typeof useBoard>;

const FAILED = "That didn't save. Try again.";

/**
 * The Board's writes and the line under the heading that answers them. Every write names what
 * happened in words; a refusal or a failure says so and leaves the board as Rust last sent it,
 * never a silent success.
 */
export function useBoardActions(
  api: Api,
  columns: readonly ColumnView[],
  name: (lane: Lane) => string,
) {
  const [line, setLine] = useState<BoardLine>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ api, columns, name });
  latest.current = { api, columns, name };
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((next: BoardLine) => {
    clearTimeout(timer.current);
    setLine(next);
    // Only plain information expires; a failure or a line with Undo stays until replaced.
    if (next && next.tone === "neutral" && !next.action) {
      timer.current = setTimeout(() => setLine(null), LINE_MS);
    }
  }, []);

  const failed = useCallback(
    (error: unknown, retry?: () => void): false => {
      show({
        text: error === "notFound" ? "That task is gone." : FAILED,
        tone: "attention",
        action:
          retry && error !== "notFound"
            ? { label: "Try again", name: "Try again saving", run: retry }
            : undefined,
      });
      return false;
    },
    [show],
  );

  const add = useCallback(
    async (title: string): Promise<boolean> => {
      const result = await latest.current.api.add({ title, lane: "backlog" });
      if (result.status === "ok") {
        show(null);
        return true;
      }
      return failed(result.error);
    },
    [failed, show],
  );

  /** Moves a task to `index` of `lane`; says where it went. */
  const moveTo = useCallback(
    async (task: TaskView, lane: Lane, index: number, say = true): Promise<boolean> => {
      const result = await latest.current.api.move(task.id, lane, index);
      if (result.status !== "ok") return failed(result.error);
      if (say)
        show({ text: `Moved ${task.title} to ${latest.current.name(lane)}.`, tone: "neutral" });
      return true;
    },
    [failed, show],
  );

  /** To the end of the next column over, or of `lane` from the menu. */
  const moveToColumn = useCallback(
    (task: TaskView, lane: Lane) => {
      const target = latest.current.columns.find((c) => c.lane === lane);
      const length = target ? target.tasks.filter((t) => t.id !== task.id).length : 0;
      return moveTo(task, lane, length);
    },
    [moveTo],
  );

  const reorder = useCallback(
    (task: TaskView, delta: -1 | 1): Promise<boolean> => {
      const at = locate(latest.current.columns, task.id);
      if (!at) return Promise.resolve(false);
      const index = at.index + delta;
      if (index < 0 || index >= at.column.tasks.length) return Promise.resolve(false);
      return moveTo(task, task.lane, index, false);
    },
    [moveTo],
  );

  const unfrog = useCallback(
    async (id: string, previous: string | null) => {
      const { api: board } = latest.current;
      const result = previous
        ? await board.setFrog(previous, true)
        : await board.setFrog(id, false);
      if (result.status !== "ok") return failed(result.error);
      show({ text: "Frog put back.", tone: "neutral" });
      return true;
    },
    [failed, show],
  );

  /** Makes the task today's Frog, or clears it. A Frog that moved says so, with Undo. */
  const toggleFrog = useCallback(
    async (task: TaskView): Promise<boolean> => {
      const on = !task.isFrog;
      const result = await latest.current.api.setFrog(task.id, on);
      if (result.status !== "ok") {
        if (result.error === "doneCannotBeFrog") {
          show({ text: "A finished task can't be the Frog.", tone: "neutral" });
          return false;
        }
        return failed(result.error);
      }
      const previous = result.data;
      if (!on) show({ text: `${task.title} is no longer the Frog.`, tone: "neutral" });
      else if (previous) {
        show({
          text: `Frog moved to ${task.title}.`,
          tone: "neutral",
          action: {
            label: "Undo",
            name: "Undo moving the Frog",
            run: () => void unfrog(task.id, previous),
          },
        });
      } else show({ text: `${task.title} is today's Frog.`, tone: "neutral" });
      return true;
    },
    [failed, show, unfrog],
  );

  const restore = useCallback(
    async (task: TaskView) => {
      const result = await latest.current.api.restore(task.id);
      if (result.status === "ok" || result.error === "notFound") {
        show({ text: `Brought back ${task.title}.`, tone: "neutral" });
        return true;
      }
      return failed(result.error, () => void restore(task));
    },
    [failed, show],
  );

  const remove = useCallback(
    async (task: TaskView): Promise<boolean> => {
      const result = await latest.current.api.remove(task.id);
      if (result.status !== "ok") return failed(result.error, () => void remove(task));
      show({
        text: `Removed ${task.title}.`,
        tone: "neutral",
        action: {
          label: "Undo",
          name: `Undo removing ${task.title}`,
          run: () => void restore(task),
        },
      });
      return true;
    },
    [failed, restore, show],
  );

  /**
   * ⌘⏎ on a card. Seam for B13: today this starts the selected preset; B9's `StartRequest.taskId`
   * links the task here, and nothing else on the Board changes.
   */
  const startOn = useCallback(
    async function startOn(task: TaskView): Promise<boolean> {
      try {
        const result = await commands.timerStart({ quick: false });
        if (result.status === "ok") return true;
        if (commandFailure(result.error) === "race") {
          // Another surface got there first: say what is true, no failure.
          show({ text: "A session is already running.", tone: "neutral" });
          return false;
        }
        console.error("timer_start failed", result.error);
      } catch (error) {
        console.error("timer_start failed", error);
      }
      show({
        text: "Focus didn't start. Orasenda's timer isn't responding.",
        tone: "attention",
        action: {
          label: "Try again",
          name: "Try again starting focus",
          run: () => void startOn(task),
        },
      });
      return false;
    },
    [show],
  );

  return { line, show, add, moveToColumn, reorder, toggleFrog, remove, startOn };
}
