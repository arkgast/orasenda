import type { ColumnView, Lane } from "@shared/ipc/bindings";
import { useCallback, useEffect, useRef, useState } from "react";
import { boardWords } from "./boardWords";
import { columnId, neighbour } from "./lanes";
import type { useBoard } from "./useBoard";
import type { BoardLine } from "./useBoardActions";

const NO_SCROLL = { preventScroll: true } as const;
const EDITOR = '[data-slot="column-editor"]';

type Api = ReturnType<typeof useBoard>;
type Edit = { name: string; limit: number | null };

/** What the Board hands each column's editor. */
export type EditorHandlers = {
  /** The column whose editor is open, and the service's words for its last refused save. */
  lane: Lane | null;
  error?: string;
  open(lane: Lane): void;
  save(lane: Lane, edit: Edit): void;
  cancel(lane: Lane): void;
  add(lane: Lane, pending: Edit | null): void;
  remove(lane: Lane): void;
};

/** The name (or strip) of a column: where focus goes when its editor closes. */
function focusName(lane: Lane) {
  const column = document.getElementById(columnId(lane));
  if (!column) return;
  if (column.matches('[data-slot="kanban-column-strip"]')) return column.focus(NO_SCROLL);
  const heading = column.querySelector<HTMLElement>("h2");
  const target = column.querySelector<HTMLElement>('[data-slot="kanban-column-name"]') ?? heading;
  if (target === heading) heading?.setAttribute("tabindex", "-1");
  target?.focus(NO_SCROLL);
}

/**
 * The column editor's state and writes (spec "Column editor"): one open at a time; Save writes
 * once and keeps the editor open with the service's words when refused; Add column after saves a
 * valid pending edit first; Remove says what happened in a toast with no Undo. Focus goes back to
 * the name unless the editor closed because focus had already left it.
 */
export function useColumnEditor(
  api: Api,
  columns: readonly ColumnView[],
  show: (line: BoardLine) => void,
): EditorHandlers {
  const [open, setOpen] = useState<{ lane: Lane; error?: string } | null>(null);
  const [back, setBack] = useState<{ lane: Lane } | null>(null);
  const latest = useRef({ api, columns, open });
  latest.current = { api, columns, open };
  // A column added a moment ago is not in the view yet; only one that was seen and went is "gone".
  const seen = useRef(false);

  const fail = useCallback(
    (error: Parameters<typeof boardWords>[0]) =>
      show({ text: boardWords(error), tone: "attention" }),
    [show],
  );

  // Set while the person's own Remove is in flight: the board may change before the reply lands.
  const leaving = useRef<Lane | null>(null);
  const prior = useRef(columns);

  useEffect(() => {
    const before = prior.current;
    prior.current = columns;
    if (!open) {
      seen.current = false;
      return;
    }
    if (columns.some((c) => c.lane === open.lane)) seen.current = true;
    else if (seen.current) {
      seen.current = false;
      setOpen(null);
      if (leaving.current === open.lane) return;
      fail("columnNotFound");
      // Focus was in the editor that has just gone: land on its neighbour, else Backlog.
      setBack({ lane: neighbour(before, open.lane, -1) ?? "backlog" });
    }
  }, [open, columns, fail]);

  // After the editor has gone, focus returns to the name.
  useEffect(() => {
    if (back) focusName(back.lane);
  }, [back]);

  const close = useCallback((lane: Lane, focusBack: boolean) => {
    setOpen((now) => (now?.lane === lane ? null : now));
    if (focusBack) setBack({ lane });
  }, []);
  /** Esc, Enter and the buttons keep focus inside the editor; a blur has already moved it. */
  const holdsFocus = () => document.activeElement?.closest(EDITOR) != null;
  const current = (lane: Lane) => latest.current.open?.lane === lane;
  const view = (lane: Lane) => latest.current.columns.find((c) => c.lane === lane);

  /** Writes the edit; true once it is saved (or nothing changed), false with the words shown. */
  const write = async (lane: Lane, edit: Edit): Promise<boolean> => {
    const column = view(lane);
    if (column && column.name === edit.name && (column.limit ?? null) === edit.limit) return true;
    const result = await latest.current.api.editColumn(lane, edit.name, edit.limit);
    if (result.status === "ok") return true;
    // Another editor may have opened meanwhile: the words still reach the person, as a toast.
    if (current(lane)) setOpen({ lane, error: boardWords(result.error) });
    else fail(result.error);
    return false;
  };

  return {
    lane: open?.lane ?? null,
    error: open?.error,
    open: (lane) => setOpen({ lane }),
    save: (lane, edit) => {
      if (!current(lane)) return;
      const hold = holdsFocus();
      void write(lane, edit).then((ok) => ok && close(lane, hold));
    },
    cancel: (lane) => {
      if (current(lane)) close(lane, holdsFocus());
    },
    add: (lane, pending) => {
      if (!current(lane)) return;
      void (async () => {
        if (pending && !(await write(lane, pending))) return;
        const result = await latest.current.api.addColumn(lane);
        if (result.status !== "ok") return fail(result.error);
        // The new column's editor opens once the board shows it.
        seen.current = false;
        setOpen({ lane: result.data });
      })();
    },
    remove: (lane) => {
      if (!current(lane)) return;
      const before = neighbour(latest.current.columns, lane, -1);
      const name = view(lane)?.name ?? "";
      void (async () => {
        leaving.current = lane;
        try {
          const result = await latest.current.api.removeColumn(lane);
          if (result.status !== "ok") return fail(result.error);
          show({ text: `Removed ${name}.`, tone: "neutral" });
          setOpen(null);
          if (before) setBack({ lane: before });
        } finally {
          leaving.current = null;
        }
      })();
    },
  };
}
