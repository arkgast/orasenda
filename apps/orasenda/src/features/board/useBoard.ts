import { type BoardError, type BoardView, commands, events, type Lane } from "@shared/ipc/bindings";
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

  // A write that answers ok but brings no event (its read-back failed in Rust) is followed by a
  // read, so a saved change never stays invisible. A late event wins over the read (`stale`).
  const write = useCallback(
    async <T>(name: string, call: Promise<Answer<T>>): Promise<Outcome<T>> => {
      const seen = newest.current;
      const outcome = await settle(name, call);
      if (outcome.status === "ok" && newest.current === seen) load();
      return outcome;
    },
    [load],
  );

  return {
    board,
    retry,
    add: useCallback(
      (draft: Parameters<typeof commands.taskAdd>[0]) => write("task_add", commands.taskAdd(draft)),
      [write],
    ),
    update: useCallback(
      (id: string, patch: Parameters<typeof commands.taskUpdate>[1]) =>
        write("task_update", commands.taskUpdate(id, patch)),
      [write],
    ),
    move: useCallback(
      (id: string, lane: Parameters<typeof commands.taskMove>[1], index: number) =>
        write("task_move", commands.taskMove(id, lane, index)),
      [write],
    ),
    setFrog: useCallback(
      (id: string, on: boolean) => write("task_set_frog", commands.taskSetFrog(id, on)),
      [write],
    ),
    remove: useCallback((id: string) => write("task_remove", commands.taskRemove(id)), [write]),
    restore: useCallback((id: string) => write("task_restore", commands.taskRestore(id)), [write]),
    inboxToTask: useCallback(
      (noteId: string) => write("inbox_to_task", commands.inboxToTask(noteId)),
      [write],
    ),
    restoreNote: useCallback(
      (taskId: string) => write("task_restore_note", commands.taskRestoreNote(taskId)),
      [write],
    ),
    editColumn: useCallback(
      (lane: Lane, name: string, limit: number | null) =>
        write("board_column_edit", commands.boardColumnEdit(lane, name, limit)),
      [write],
    ),
    /** The new column's id, or `null` when it was refused or could not be reached. */
    addColumn: useCallback(
      async (after: Lane): Promise<Lane | null> => {
        const outcome = await write("board_column_add", commands.boardColumnAdd(after));
        return outcome.status === "ok" ? outcome.data : null;
      },
      [write],
    ),
    removeColumn: useCallback(
      (lane: Lane) => write("board_column_remove", commands.boardColumnRemove(lane)),
      [write],
    ),
    foldColumn: useCallback(
      (lane: Lane, folded: boolean) =>
        write("board_column_fold", commands.boardColumnFold(lane, folded)),
      [write],
    ),
  };
}
