import { useTaskOptions } from "@domain/board/useTaskOptions";
import { TaskPicker } from "@orasenda/ui";
import type { ReactElement } from "react";

type Props = {
  /** The chosen task from the timer view: the next session's while idle, the live one's after. */
  task: { id: string; title: string } | null;
  onPick(id: string | null): void;
};

/**
 * Today's optional task. Quiet text at rest, never a default, never required: it sits above the
 * time and below the status row, and Start stays the one primary action.
 */
export function TaskSlot({ task, onPick }: Props): ReactElement {
  const options = useTaskOptions();
  return (
    <div data-slot="today-task" className="today-task">
      <TaskPicker task={task ?? undefined} options={options} onPick={onPick} />
    </div>
  );
}
