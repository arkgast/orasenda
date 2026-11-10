import { type ReactElement, type ReactNode, useId } from "react";
import { cn } from "../../lib/utils";
import { ModeChip } from "./mode-chip";

export interface KanbanColumnProps {
  title: string;
  count: number;
  limit?: number;
  children?: ReactNode;
  emptyMessage?: string;
}

function whole(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** A board column: heading, a count against the user's limit, and the cards. */
export function KanbanColumn(props: KanbanColumnProps): ReactElement {
  const id = useId();
  const n = whole(props.count);
  const limit = props.limit == null ? null : whole(props.limit);
  const atLimit = limit != null && n >= limit;
  return (
    <section
      data-slot="kanban-column"
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 max-w-column-width flex-1 basis-column-min-width flex-col gap-3 rounded-lg bg-surface-sunken p-3",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="m-0 text-heading">
          {props.title}
        </h2>
        {atLimit ? (
          <ModeChip mode="warning">{n > limit ? `${n} of ${limit}` : "At limit"}</ModeChip>
        ) : (
          <span className="font-mono text-caption text-ink-muted tabular-nums">
            {limit == null ? `${n} tasks` : `${n} of ${limit}`}
          </span>
        )}
      </header>
      {props.children || (
        <p className="m-0 text-body-sm text-ink-muted">
          {props.emptyMessage || "Nothing here yet. That's fine."}
        </p>
      )}
    </section>
  );
}
