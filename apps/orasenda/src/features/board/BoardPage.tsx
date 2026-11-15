import { useBoardNotice } from "@domain/board/useBoardNotice";
import { useSingleKeySetting } from "@domain/keyboard/useSingleKeySetting";
import { PagesButton } from "@domain/navigation/PagesButton";
import {
  Button,
  EmptyState,
  InlineNotice,
  type NavPage,
  PageFrame,
  ScrollRegion,
} from "@orasenda/ui";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import type { Lane } from "@shared/ipc/bindings";
import { useCallback, useEffect, useRef, useState } from "react";
import { BoardColumns } from "./BoardColumns";
import { TaskSheet } from "./detail/TaskSheet";
import { ImportSheet } from "./import/ImportSheet";
import { takeImportAsk } from "./import/importAsk";
import { NEW_TASK_ID } from "./NewTaskField";
import { useBoard } from "./useBoard";
import { useBoardActions } from "./useBoardActions";
import { useBoardKeys } from "./useBoardKeys";
import { useFolds } from "./useFolds";
import { useRoom } from "./useRoom";
import "./board.css";

/** Anything that takes keys for itself: the palette, a dialog, an open menu or list. */
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], dialog[open], [role="menu"], [role="listbox"]';

type Props = {
  onNavigate(page: NavPage): void;
  /** Return on a card (B11 opens the detail here). */
  onOpenTask?: (id: string) => void;
  /** A counter the app bumps to open the import sheet; it opens once per new value. */
  importAsked?: number;
  /** Called when the sheet opened for `importAsked`. */
  onImportOpened?: () => void;
};

/** Board page: Backlog, Today, Doing and Done, kept by keyboard and by menu (spec "Board page"). */
export function BoardPage({ onNavigate, onOpenTask, importAsked, onImportOpened }: Props) {
  const { compact } = useWindowLayout();
  const api = useBoard();
  const ok = api.board.status === "ok" ? api.board.board : null;
  const columns = ok?.columns ?? [];
  const name = (lane: Lane) => columns.find((c) => c.lane === lane)?.name ?? lane;
  const actions = useBoardActions(api, columns, name);
  const singleKeys = useSingleKeySetting().on;
  // A start from anywhere may move a task back to Today or fail to write the board: say so here.
  const { show } = actions;
  useBoardNotice((notice) =>
    show({ text: notice.message, tone: notice.kind === "notSaved" ? "attention" : "neutral" }),
  );

  // A callback ref: the board div mounts and unmounts (empty board, first run), and the room
  // measure must follow it.
  const box = useRef<HTMLDivElement | null>(null);
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const setBox = useCallback((el: HTMLDivElement | null) => {
    box.current = el;
    setBoxEl(el);
  }, []);
  const room = useRoom(boxEl, ok !== null && !compact);
  const running = columns.find((c) => c.tasks.some((t) => t.active))?.lane ?? null;
  const folds = useFolds(compact ? 4 : room, running);
  const keys = useBoardKeys({ root: box, columns, open: folds.open, singleKeys, actions });

  // The field is in Backlog; an empty board shows the empty state until Add task asks for it.
  const [adding, setAdding] = useState(false);
  const [asked, setAsked] = useState(0);
  const empty = ok !== null && columns.every((c) => c.count === 0) && !adding;
  const addTask = () => {
    if (!ok) return;
    setAdding(true);
    if (!folds.open.includes("backlog")) folds.toggle("backlog");
    setAsked((n) => n + 1);
  };
  const latestAdd = useRef(addTask);
  latestAdd.current = addTask;

  // After the render that brought the field in, focus it.
  useEffect(() => {
    if (asked > 0) document.getElementById(NEW_TASK_ID)?.focus();
  }, [asked]);

  // ⌘N while the Board is shown: the page's own key, not the registry's. A user binding that
  // took the key first has already handled it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      )
        return;
      if (event.key.toLowerCase() !== "n") return;
      // The palette, a dialog or an open menu has the key.
      if (document.querySelector(OVERLAY)) return;
      event.preventDefault();
      latestAdd.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const leaveField = () => {
    const stop = box.current?.querySelector<HTMLElement>(
      'button[data-slot="task-card"][tabindex="0"]',
    );
    (stop ?? document.querySelector<HTMLElement>("h1"))?.focus();
  };

  // The sheet is the Board's own; the prop only lets a host know. A task that goes away closes it.
  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheetTask = columns.flatMap((c) => c.tasks).find((t) => t.id === sheetId);
  const openTask = (id: string) => {
    actions.show(null);
    setSheetId(id);
    onOpenTask?.(id);
  };
  const line = actions.line;

  // The import sheet opens on a click or when the app asks; nothing opens it by itself.
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    if (takeImportAsk(importAsked)) {
      actions.show(null);
      setImporting(true);
      onImportOpened?.();
    }
  }, [importAsked, onImportOpened, actions.show]);
  // The sheet closing leaves focus nowhere when its trigger is gone (the empty Board's button).
  const wasImporting = useRef(false);
  useEffect(() => {
    const closed = wasImporting.current && !importing;
    wasImporting.current = importing;
    if (!closed) return;
    // Radix gives focus back a timer tick after the sheet unmounts, to whatever had it when the sheet opened.
    // Opened from the palette or Settings, that is outside the Board: check after that tick and bring it home.
    const tick = window.setTimeout(() => {
      const at = document.activeElement;
      const main = document.querySelector("h1")?.closest("main");
      if (at && at !== document.body && main?.contains(at)) return;
      const again = [...document.querySelectorAll<HTMLElement>("button")].find(
        (b) => b.textContent === "Import tasks…",
      );
      (again ?? document.querySelector<HTMLElement>("h1"))?.focus();
    }, 0);
    return () => window.clearTimeout(tick);
  }, [importing]);
  const askImport = () => {
    actions.show(null);
    setImporting(true);
  };
  const status =
    api.board.status === "error" ? (
      <InlineNotice
        variant="row"
        tone="attention"
        actionLabel="Try again"
        actionName="Try again loading the board"
        onAction={() => {
          // The button unmounts with the failure line: keep focus on the heading.
          document.querySelector<HTMLElement>("h1")?.focus();
          api.retry();
        }}
      >
        The board couldn't be loaded. Try again.
      </InlineNotice>
    ) : (
      <InlineNotice
        variant="row"
        tone={line?.tone ?? "neutral"}
        actionLabel={line?.action?.label}
        actionName={line?.action?.name}
        onAction={line?.action?.run}
      >
        {line?.text ?? ""}
      </InlineNotice>
    );

  const board = ok ? (
    <div
      ref={setBox}
      className={compact ? "app-board-stack" : "app-board"}
      onKeyDownCapture={keys.onKeyDownCapture}
      onFocusCapture={keys.onFocusCapture}
    >
      <BoardColumns
        board={ok}
        open={folds.open}
        on={{
          selected: keys.selected,
          select: keys.select,
          openTask,
          move: (task, lane) => void keys.moveTo(task, lane),
          frog: (task) => void actions.toggleFrog(task),
          remove: (task) =>
            void actions.remove(task).then((done) => done && keys.focusBeside(task)),
          toggle: (lane) => {
            const opening = !folds.open.includes(lane);
            folds.toggle(lane);
            if (opening) queueMicrotask(() => keys.focusColumn(lane));
          },
          add: actions.add,
          leaveField,
          import: askImport,
        }}
      />
    </div>
  ) : null;

  return (
    <div className="app-board-page">
      <PageFrame
        title="Board"
        compactPicker={
          compact ? <PagesButton current="board" onNavigate={onNavigate} /> : undefined
        }
        primary={
          ok && !empty ? (
            <Button variant="primary" onClick={addTask}>
              Add task
            </Button>
          ) : undefined
        }
        status={status}
      >
        {empty ? (
          <EmptyState
            title="No tasks yet."
            message="Add one, move a note from the Inbox, or import tasks."
            actionLabel="Add task"
            onAction={addTask}
            secondaryAction={{ label: "Import tasks…", onAction: askImport }}
          />
        ) : compact ? (
          <ScrollRegion label="Board">{board}</ScrollRegion>
        ) : (
          board
        )}
      </PageFrame>
      {importing ? (
        <ImportSheet onImported={actions.imported} onClose={() => setImporting(false)} />
      ) : null}
      {sheetTask ? (
        <TaskSheet
          key={sheetTask.id}
          task={sheetTask}
          columns={columns}
          update={api.update}
          move={api.move}
          toggleFrog={actions.toggleFrog}
          boardLine={line}
          onSaveFailed={(text) => actions.show({ text, tone: "attention" })}
          onClose={() => setSheetId(null)}
        />
      ) : null}
    </div>
  );
}
