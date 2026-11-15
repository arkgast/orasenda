import { Button, KanbanColumn } from "@orasenda/ui";
import type { BoardView, Lane, TaskView } from "@shared/ipc/bindings";
import { BoardCard } from "./BoardCard";
import { columnId, sessions } from "./lanes";
import { NewTaskField } from "./NewTaskField";

export type ColumnHandlers = {
  selected: string | null;
  select(id: string): void;
  openTask(id: string): void;
  move(task: TaskView, lane: Lane): void;
  frog(task: TaskView): void;
  remove(task: TaskView): void;
  toggle(lane: Lane): void;
  add(title: string): Promise<boolean>;
  leaveField(): void;
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
}: {
  board: BoardView;
  open: readonly Lane[];
  on: ColumnHandlers;
}) {
  return board.columns.map((column) => {
    const folded = !open.includes(column.lane);
    const shared = {
      id: columnId(column.lane),
      title: column.name,
      count: column.count,
      limit: column.limit ?? undefined,
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
        footer={footerOf(column.lane, board, on)}
      >
        {column.lane === "backlog" ? <NewTaskField add={on.add} leave={on.leaveField} /> : null}
        {column.tasks.map((task) => (
          <BoardCard
            key={task.id}
            task={task}
            density={column.lane === "backlog" ? "row" : "card"}
            columns={board.columns}
            selected={on.selected === task.id}
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
