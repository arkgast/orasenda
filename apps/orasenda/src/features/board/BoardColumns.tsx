import { Button, KanbanColumn } from "@orasenda/ui";
import type { BoardView, Lane, TaskView } from "@shared/ipc/bindings";
import { BoardCard } from "./BoardCard";
import { columnId, sessions } from "./lanes";
import { NewTaskField, newTaskId } from "./NewTaskField";
import type { DragView } from "./useCardDrag";

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
  closeField(lane: Lane, back: boolean): void;
  /** Opens the import sheet. */
  import(): void;
};

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
            leave={() => on.closeField(column.lane, true)}
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
