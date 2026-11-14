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
import { useEffect, useRef, useState } from "react";
import { BoardColumns } from "./BoardColumns";
import { NEW_TASK_ID } from "./NewTaskField";
import { useBoard } from "./useBoard";
import { useBoardActions } from "./useBoardActions";
import { useBoardKeys } from "./useBoardKeys";
import { useFolds } from "./useFolds";
import { useRoom } from "./useRoom";
import { useSingleKeyOn } from "./useSingleKeyOn";
import "./board.css";

type Props = {
  onNavigate(page: NavPage): void;
  /** Return on a card (B11 opens the detail here). */
  onOpenTask?: (id: string) => void;
};

/** Board page: Backlog, Today, Doing and Done, kept by keyboard and by menu (spec "Board page"). */
export function BoardPage({ onNavigate, onOpenTask }: Props) {
  const { compact } = useWindowLayout();
  const api = useBoard();
  const ok = api.board.status === "ok" ? api.board.board : null;
  const columns = ok?.columns ?? [];
  const name = (lane: Lane) => columns.find((c) => c.lane === lane)?.name ?? lane;
  const actions = useBoardActions(api, columns, name);
  const singleKeys = useSingleKeyOn();

  const box = useRef<HTMLDivElement>(null);
  const room = useRoom(box, ok !== null && !compact);
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

  const openTask = (id: string) => onOpenTask?.(id);
  const line = actions.line;
  const status =
    api.board.status === "error" ? (
      <InlineNotice
        variant="row"
        tone="attention"
        actionLabel="Try again"
        actionName="Try again loading the board"
        onAction={api.retry}
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
      ref={box}
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
          move: (task, lane) => void actions.moveToColumn(task, lane),
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
            message="Add one, or move a note from the Inbox."
            actionLabel="Add task"
            onAction={addTask}
          />
        ) : compact ? (
          <ScrollRegion label="Board">{board}</ScrollRegion>
        ) : (
          board
        )}
      </PageFrame>
    </div>
  );
}
