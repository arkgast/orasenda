import { Button, ColumnEditor, KanbanColumn } from "@orasenda/ui";
import type { BoardView, ColumnView, Lane, TaskView } from "@shared/ipc/bindings";
import { BoardCard } from "./BoardCard";
import { boardWords } from "./boardWords";
import { columnId, sessions } from "./lanes";
import { NewTaskField, newTaskId } from "./NewTaskField";
import type { DragView } from "./useCardDrag";
import type { EditorHandlers } from "./useColumnEditor";

export type ColumnHandlers = {
  selected: string | null;
  select(id: string): void;
  openTask(id: string): void;
  move(task: TaskView, lane: Lane): void;
  frog(task: TaskView): void;
  remove(task: TaskView): void;
  toggle(lane: Lane): void;
  add(title: string, lane: Lane): Promise<boolean>;
  leaveField(): void;
  /** The column whose header + opened a field (never Backlog, whose field is always there). */
  field: Lane | null;
  /** A header +: Backlog's focuses its field, another column opens one. */
  plus(lane: Lane): void;
  /** Closes that column's field; `back` returns focus to its +. */
  /** `now`: Esc, focus goes to + at once; else only if the blur left it nowhere. */
  closeField(lane: Lane, back: boolean, now?: boolean): void;
  /** Opens the import sheet. */
  import(): void;
  /** The column editor: which column has it open and what it does. */
  editor: EditorHandlers;
};

const MOST_CUSTOM = 4;
/** The limit stepper per kind (spec "Column editor"): none for Backlog and Done. */
function limitOf(column: ColumnView) {
  const value = column.limit ?? null;
  if (column.custom) return { value: value ?? 0, min: 0, max: 9, zeroLabel: "No limit" };
  if (column.lane === "today") return { value: value ?? 3, min: 1, max: 9 };
  if (column.lane === "doing") return { value: value ?? 1, min: 1, max: 3 };
  return null;
}

function editorOf(column: ColumnView, board: BoardView, on: ColumnHandlers) {
  const { editor } = on;
  const full = board.columns.filter((c) => c.custom).length >= MOST_CUSTOM;
  const canRemove = !column.custom
    ? null
    : column.tasks.length > 0
      ? { reason: boardWords("columnNotEmpty") }
      : (true as const);
  return (
    <ColumnEditor
      name={column.name}
      limit={limitOf(column)}
      error={editor.error}
      taken={board.columns.filter((c) => c.lane !== column.lane).map((c) => c.name)}
      canAdd={
        column.lane === "done" ? null : full ? { reason: boardWords("tooManyColumns") } : true
      }
      canRemove={canRemove}
      onSave={(edit) => editor.save(column.lane, edit)}
      onCancel={() => editor.cancel(column.lane)}
      onAdd={(pending) => editor.add(column.lane, pending)}
      onRemove={() => editor.remove(column.lane)}
    />
  );
}

function footerOf(lane: Lane, board: BoardView, on: ColumnHandlers) {
  if (lane === "backlog")
    return (
      <Button variant="ghost" onClick={on.import}>
        Import tasks…
      </Button>
    );
  if (lane === "today" && board.todayPlanned > 0) {
    return (
      <p className="app-board-planned">
        Planned {sessions(board.todayPlanned)} with a {board.buffer}% buffer
      </p>
    );
  }
  return undefined;
}

/** The four columns, Today-first (owner pick 1B): Backlog a narrow row list, Today and Doing wide. */
export function BoardColumns({
  board,
  open,
  on,
  drag,
}: {
  board: BoardView;
  open: readonly Lane[];
  on: ColumnHandlers;
  /** A card is being dragged: the slot and the Moving card. */
  drag?: DragView | null;
}) {
  return board.columns.map((column) => {
    const folded = !open.includes(column.lane);
    const shared = {
      id: columnId(column.lane),
      title: column.name,
      count: column.count,
      limit: column.limit ?? undefined,
      drop:
        drag?.drop?.lane === column.lane
          ? { index: drag.drop.index, label: drag.drop.label }
          : undefined,
      width: column.lane === "today" || column.lane === "doing" ? ("wide" as const) : undefined,
    };
    if (folded) {
      return (
        <KanbanColumn
          key={column.lane}
          {...shared}
          collapsed
          onToggle={() => on.toggle(column.lane)}
        />
      );
    }
    return (
      <KanbanColumn
        key={column.lane}
        {...shared}
        onToggle={() => on.toggle(column.lane)}
        onEdit={() => on.editor.open(column.lane)}
        editor={on.editor.lane === column.lane ? editorOf(column, board, on) : undefined}
        onAdd={column.lane === "done" ? undefined : () => on.plus(column.lane)}
        footer={footerOf(column.lane, board, on)}
      >
        {column.lane === "backlog" ? (
          <NewTaskField add={(title) => on.add(title, "backlog")} leave={on.leaveField} />
        ) : on.field === column.lane ? (
          <NewTaskField
            id={newTaskId(column.lane)}
            label={`New task in ${column.name}`}
            add={(title) => on.add(title, column.lane)}
            leave={() => on.closeField(column.lane, true, true)}
            onBlurEmpty={(lost) => on.closeField(column.lane, lost)}
          />
        ) : null}
        {column.tasks.map((task) => (
          <BoardCard
            key={task.id}
            task={task}
            density={column.lane === "backlog" ? "row" : "card"}
            columns={board.columns}
            selected={on.selected === task.id}
            moving={drag?.id === task.id}
            onSelect={on.select}
            onOpen={on.openTask}
            onMove={on.move}
            onFrog={on.frog}
            onRemove={on.remove}
          />
        ))}
      </KanbanColumn>
    );
  });
}
