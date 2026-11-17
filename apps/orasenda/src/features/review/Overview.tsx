import { Button, Icon } from "@orasenda/ui";
import type { PriorityView, ReviewPrimary, ReviewView } from "@shared/ipc/bindings";
import { type ReactElement, type ReactNode, useId } from "react";

/** A guided review: the day's shutdown or the week's review. */
export type Flow = "shutdown" | "weekly";

export const START_LABELS: Record<Flow, string> = {
  shutdown: "Start shutdown",
  weekly: "Start weekly review",
};

const LOOK_AGAIN: Record<Flow, string> = {
  shutdown: "Look again at the shutdown",
  weekly: "Look again at the weekly review",
};

/** The flow the page's primary button starts, or null when no flow leads. */
export function primaryFlow(primary: ReviewPrimary): Flow | null {
  return primary === "none" ? null : primary;
}

/** The button in a section for its own flow: Look again once complete, else a quiet Start. */
function FlowButton({
  flow,
  complete,
  onStart,
}: {
  flow: Flow;
  complete: boolean;
  onStart(flow: Flow): void;
}): ReactElement {
  return (
    <Button
      variant="quiet"
      aria-label={complete ? LOOK_AGAIN[flow] : undefined}
      onClick={() => onStart(flow)}
    >
      {complete ? "Look again" : START_LABELS[flow]}
    </Button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  const id = useId();
  return (
    <section aria-labelledby={id} className="app-review-section">
      <h2 id={id} className="app-review-heading">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Priority({ priority }: { priority: PriorityView }): ReactElement {
  // Done is the word in Rust's line and a tick beside it: never colour alone.
  return (
    <li className="app-review-priority" data-done={priority.done ? "" : undefined}>
      {priority.done ? <Icon name="check" size="md" /> : null}
      <span>{priority.line}</span>
    </li>
  );
}

type Props = {
  view: ReviewView;
  onStart(flow: Flow): void;
};

/** The overview's two sections. The page's header holds the one primary (see `primaryFlow`). */
export function Overview({ view, onStart }: Props): ReactElement {
  const lead = primaryFlow(view.primary);
  const { today, week } = view;
  return (
    <div className="app-review-body">
      <Section title="Today">
        <p className="app-review-label">{today.dayLabel}</p>
        <p className="app-review-line">{today.line}</p>
        {today.done || lead !== "shutdown" ? (
          <div className="app-review-actions">
            <FlowButton flow="shutdown" complete={today.done} onStart={onStart} />
          </div>
        ) : null}
      </Section>
      <Section title="This week">
        <p className="app-review-label">{week.label}</p>
        <p className="app-review-line">{week.line}</p>
        {week.priorities.length > 0 ? (
          <ul className="app-review-priorities">
            {week.priorities.map((p) => (
              <Priority key={p.taskId} priority={p} />
            ))}
          </ul>
        ) : null}
        {week.planned || lead !== "weekly" ? (
          <div className="app-review-actions">
            <FlowButton flow="weekly" complete={week.planned} onStart={onStart} />
          </div>
        ) : null}
      </Section>
      {/* V15b mounts the Stats section here. */}
    </div>
  );
}
