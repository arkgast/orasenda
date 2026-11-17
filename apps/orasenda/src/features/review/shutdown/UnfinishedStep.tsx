import { Button, Icon, InlineNotice, ScrollRegion } from "@orasenda/ui";
import type { ShutdownView_Serialize, UnfinishedTask } from "@shared/ipc/bindings";
import type { ReactElement } from "react";

type Props = {
  view: ShutdownView_Serialize;
  picked: ReadonlySet<string>;
  /** A failed move, in a plain line; the choices stay. */
  line: string | null;
  onToggle(id: string): void;
};

function Row({
  task,
  on,
  onToggle,
}: {
  task: UnfinishedTask;
  on: boolean;
  onToggle(id: string): void;
}): ReactElement {
  // The state is a word and a tick as well as a style: never colour alone.
  const where = task.active
    ? "In progress"
    : on
      ? `${task.laneLabel} · Goes to Backlog`
      : task.laneLabel;
  return (
    <li className="app-shutdown-task">
      <div className="app-shutdown-task-text">
        <span>{task.title}</span>
        <span className="app-shutdown-task-where">{where}</span>
      </div>
      {task.active ? null : (
        <Button
          variant="quiet"
          aria-pressed={on}
          aria-label={`Back to Backlog ${task.title}`}
          className="aria-pressed:border-focus aria-pressed:bg-selection"
          onClick={() => onToggle(task.id)}
        >
          {on ? <Icon name="check" size="md" /> : null}
          Back to Backlog
        </Button>
      )}
    </li>
  );
}

/** Step 1: Today and Doing tasks, each with an optional, off-by-default Back to Backlog toggle. */
export function UnfinishedStep({ view, picked, line, onToggle }: Props): ReactElement {
  return (
    <ScrollRegion label="Unfinished tasks">
      <div className="app-shutdown-body">
        <p className="app-review-label">{view.dayLabel}</p>
        {view.unfinished.length === 0 ? (
          <p className="app-review-line">Nothing unfinished.</p>
        ) : (
          <>
            <p className="app-review-line">
              Choose any you would like to move back to Backlog. The rest stay where they are.
            </p>
            <ul className="app-shutdown-tasks">
              {view.unfinished.map((task) => (
                <Row key={task.id} task={task} on={picked.has(task.id)} onToggle={onToggle} />
              ))}
            </ul>
          </>
        )}
        {line ? <InlineNotice>{line}</InlineNotice> : null}
      </div>
    </ScrollRegion>
  );
}
