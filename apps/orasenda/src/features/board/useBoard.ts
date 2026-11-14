import { type BoardError, type BoardView, commands, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useCallback, useEffect, useRef, useState } from "react";

export type Board =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; board: BoardView };

/** What a board command answered: ok, a typed refusal from Rust, or a failure to reach it. */
export type Outcome<T = null> =
  | { status: "ok"; data: T }
  | { status: "error"; error: BoardError | "unreachable" };

type Answer<T> = { status: "ok"; data: T } | { status: "error"; error: BoardError };

async function settle<T>(name: string, call: Promise<Answer<T>>): Promise<Outcome<T>> {
  try {
    return await call;
  } catch (error) {
    console.error(`${name} failed`, error);
    return { status: "error", error: "unreachable" };
  }
}

/**
 * The board from `board_get`, kept current by `board-changed`. Every event carries a `seq`; one
 * older than what is shown is dropped, so the newest wins whichever window it came from. A read
 * that fails is `error`, never an empty board, and an answer asked for before an event is not
 * shown over it.
 */
export function useBoard() {
  const [board, setBoard] = useState<Board>({ status: "loading" });
  const newest = useRef(0);
  const asked = useRef(0);

  const load = useCallback(() => {
    const ticket = ++asked.current;
    const seenSeq = newest.current;
    const stale = () => ticket !== asked.current || newest.current !== seenSeq;
    commands.boardGet().then(
      (result) => {
        if (stale()) return;
        setBoard(
          result.status === "ok" ? { status: "ok", board: result.data } : { status: "error" },
        );
      },
      (error: unknown) => {
        console.error("board_get failed", error);
        if (!stale()) setBoard({ status: "error" });
      },
    );
  }, []);

  useEffect(() => {
    const stop = subscribe("board-changed", events.boardChanged.listen, ({ seq, board }) => {
      if (seq <= newest.current) return;
      newest.current = seq;
      setBoard({ status: "ok", board });
    });
    load();
    return stop;
  }, [load]);

  const retry = useCallback(() => {
    setBoard({ status: "loading" });
    load();
  }, [load]);

  return {
    board,
    retry,
    add: useCallback(
      (draft: Parameters<typeof commands.taskAdd>[0]) =>
        settle("task_add", commands.taskAdd(draft)),
      [],
    ),
    update: useCallback(
      (id: string, patch: Parameters<typeof commands.taskUpdate>[1]) =>
        settle("task_update", commands.taskUpdate(id, patch)),
      [],
    ),
    move: useCallback(
      (id: string, lane: Parameters<typeof commands.taskMove>[1], index: number) =>
        settle("task_move", commands.taskMove(id, lane, index)),
      [],
    ),
    setFrog: useCallback(
      (id: string, on: boolean) => settle("task_set_frog", commands.taskSetFrog(id, on)),
      [],
    ),
    remove: useCallback((id: string) => settle("task_remove", commands.taskRemove(id)), []),
    restore: useCallback((id: string) => settle("task_restore", commands.taskRestore(id)), []),
    inboxToTask: useCallback(
      (noteId: string) => settle("inbox_to_task", commands.inboxToTask(noteId)),
      [],
    ),
    restoreNote: useCallback(
      (taskId: string) => settle("task_restore_note", commands.taskRestoreNote(taskId)),
      [],
    ),
    setColumns: useCallback(
      (columns: Parameters<typeof commands.boardColumnsSet>[0]) =>
        settle("board_columns_set", commands.boardColumnsSet(columns)),
      [],
    ),
  };
}
