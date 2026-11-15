import { TaskCard } from "@orasenda/ui";
import type { ColumnView, Lane, TaskView } from "@shared/ipc/bindings";

type Props = {
  task: TaskView;
  /** Backlog is a narrow list of one-line rows. */
  density: "card" | "row";
  columns: readonly ColumnView[];
  selected: boolean;
  onSelect(id: string): void;
  onOpen(id: string): void;
  onMove(task: TaskView, lane: Lane): void;
  onFrog(task: TaskView): void;
  onRemove(task: TaskView): void;
};

/** One task: the wrapper carries the id and lane the board's keys look for. */
export function BoardCard({ task, density, columns, selected, ...on }: Props) {
  const done = task.checklist.filter((item) => item.done).length;
  return (
    <div data-task-id={task.id} data-lane={task.lane}>
      <TaskCard
        title={task.title}
        type={task.kind}
        estimate={task.estimate ?? undefined}
        done={task.sessions}
        tracked={task.tracked}
        frog={task.isFrog}
        active={task.active}
        selected={selected}
        density={density}
        tags={task.tags}
        due={task.dueLabel ?? undefined}
        priority={task.priority ?? undefined}
        checklist={task.checklist.length ? { done, total: task.checklist.length } : undefined}
        onSelect={() => on.onSelect(task.id)}
        onOpen={() => on.onOpen(task.id)}
        menuTabIndex={-1}
        menu={{
          moveTargets: columns
            .filter((c) => c.lane !== task.lane)
            .map((c) => ({ id: c.lane, label: c.name })),
          onMove: (lane) => on.onMove(task, lane as Lane),
          onFrog: task.lane === "done" ? undefined : () => on.onFrog(task),
          onRemove: () => on.onRemove(task),
        }}
      />
    </div>
  );
}
