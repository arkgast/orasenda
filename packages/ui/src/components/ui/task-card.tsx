import type { ReactElement } from "react";
import { cn } from "../../lib/utils";
import { ModeChip } from "./mode-chip";

export interface TaskCardProps {
  title: string;
  type?: "deep" | "shallow";
  estimate?: number;
  done?: number;
  tracked?: string;
  project?: string;
  frog?: boolean;
  active?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onOpen?: () => void;
}

const MAX_DOTS = 12;

function count(n: number | undefined): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n as number)) : 0;
}

/** A task on the board. A native button when it can open, a read-only article when it cannot. */
export function TaskCard(props: TaskCardProps): ReactElement {
  const { title, onOpen, active, selected } = props;
  const est = count(props.estimate);
  const done = count(props.done);
  const hasEstimate = props.estimate != null;
  const kind = props.type === "shallow" ? "Shallow" : "Deep";
  const dots = [];
  for (let i = 0; i < Math.min(MAX_DOTS, Math.max(est, done)); i++) {
    const over = hasEstimate && i >= est && i < done;
    dots.push(
      <span
        key={i}
        data-slot="task-card-dot"
        data-done={i < done ? "" : undefined}
        data-over={over ? "" : undefined}
        className={cn(
          "size-icon-sm flex-none rounded-pill forced-colors:border",
          i >= done && "border-2 border-line-strong",
          i < done && "bg-focus",
          over && "border border-line-strong inset-ring-2 inset-ring-surface-raised",
        )}
      />,
    );
  }
  const meta = `${hasEstimate ? `Est ${est}` : "No estimate"} · Done ${done}${props.tracked ? ` · ${props.tracked}` : ""}`;
  const stateWords = [active ? "In progress" : "", selected ? "Selected" : ""]
    .filter(Boolean)
    .join(" · ");
  const name = onOpen
    ? `${title}, ${kind}${props.frog ? ", Frog" : ""}, ${done} sessions done, ${hasEstimate ? `${est} estimated` : "no estimate"}${props.tracked ? `, ${props.tracked}` : ""}${props.project ? `, ${props.project}` : ""}${active ? ", In progress" : ""}${selected ? ", Selected" : ""}`
    : undefined;
  const className = cn(
    "@container flex w-full max-w-full flex-col gap-3 rounded-md border border-line-strong bg-surface-raised p-4 text-start text-ink shadow-raised wrap-anywhere",
    onOpen &&
      "cursor-pointer outline-focus-ring outline-offset-2 transition-colors duration-quick ease-calm focus-visible:outline-2 enabled:hover:bg-surface-sunken enabled:active:bg-selection disabled:cursor-default disabled:border-dashed motion-reduce:transition-none",
    selected && "bg-selection",
    active && "border-s-4 border-s-focus",
  );
  const body = (
    <>
      <span data-slot="task-card-top" className="flex flex-wrap items-center gap-2">
        <ModeChip mode={props.type === "shallow" ? "shallow" : "focus"}>{kind}</ModeChip>
        {props.frog ? (
          <span data-slot="task-card-frog" className="text-break text-label uppercase">
            Frog
          </span>
        ) : null}
      </span>
      <span data-slot="task-card-title" className="text-body font-semibold">
        {title}
      </span>
      {stateWords ? (
        <span data-slot="task-card-state" className="text-body-sm text-focus">
          {stateWords}
        </span>
      ) : null}
      <span aria-hidden="true" data-slot="task-card-dots" className="inline-flex flex-wrap gap-1-5">
        {dots}
      </span>
      <span
        data-slot="task-card-meta"
        className="font-mono text-body-sm text-ink-muted tabular-nums"
      >
        {meta}
      </span>
      {props.project ? (
        <span data-slot="task-card-project" className="text-body-sm text-ink-muted">
          {props.project}
        </span>
      ) : null}
    </>
  );
  return onOpen ? (
    <button
      type="button"
      data-slot="task-card"
      onClick={onOpen}
      disabled={props.disabled}
      aria-label={name}
      className={className}
    >
      {body}
    </button>
  ) : (
    <article data-slot="task-card" className={className}>
      {body}
    </article>
  );
}
