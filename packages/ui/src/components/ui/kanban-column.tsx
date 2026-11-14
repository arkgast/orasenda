import { type ReactElement, type ReactNode, useId } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { ModeChip } from "./mode-chip";

export interface KanbanColumnProps {
  title: string;
  count: number;
  limit?: number;
  children?: ReactNode;
  emptyMessage?: string;
  /** Sits under the cards, inside the column (an "Add task" control). */
  footer?: ReactNode;
  /** The header's action slot (a column menu). */
  action?: ReactNode;
  /** "wide" grows to column-wide-width (Today and Doing in the Today-first board). */
  width?: "standard" | "wide";
  /** Folds the column into a strip. Needs onToggle to be useful. */
  collapsed?: boolean;
  onToggle?: () => void;
  /** On the region, so the board can move focus between columns. */
  id?: string;
}

function whole(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** "2 of 3" under the limit, "At limit" at it (both plain captions); over it the caption is a chip. */
function caption(n: number, limit: number | null): { text: string; over: boolean } {
  if (limit == null) return { text: `${n} tasks`, over: false };
  if (n > limit) return { text: `${n} of ${limit}`, over: true };
  return { text: n === limit ? "At limit" : `${n} of ${limit}`, over: false };
}

/** A board column: heading, a count against the user's limit, and the cards. */
export function KanbanColumn(props: KanbanColumnProps): ReactElement {
  const headingId = useId();
  const n = whole(props.count);
  const limit = props.limit == null ? null : whole(props.limit);
  const { text, over } = caption(n, limit);
  if (props.collapsed) {
    return (
      <button
        type="button"
        id={props.id}
        data-slot="kanban-column-strip"
        aria-expanded="false"
        aria-label={`${props.title}, ${text}`}
        onClick={props.onToggle}
        className="group flex w-column-strip-width flex-none cursor-pointer flex-col items-center gap-3 self-stretch rounded-lg border-0 bg-surface-sunken p-3 text-ink outline-focus-ring outline-offset-2 transition-colors duration-quick ease-calm hover:inset-ring-1 hover:inset-ring-line-strong focus-visible:outline-2 active:bg-selection motion-reduce:transition-none"
      >
        <span aria-hidden="true" className="text-ink-muted group-hover:text-ink">
          <Icon name="chevron" />
        </span>
        <span aria-hidden="true" className="text-label wrap-anywhere">
          {props.title}
        </span>
        <span
          aria-hidden="true"
          className="font-mono text-caption text-ink-muted tabular-nums group-hover:text-ink"
        >
          {over ? text : n}
        </span>
      </button>
    );
  }
  return (
    <section
      data-slot="kanban-column"
      id={props.id}
      aria-labelledby={headingId}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 basis-column-min-width flex-col gap-3 rounded-lg bg-surface-sunken p-3",
        props.width === "wide" ? "max-w-column-wide-width" : "max-w-column-width",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="m-0 text-heading">
          {props.title}
        </h2>
        <span className="flex items-center gap-2">
          {over ? (
            <ModeChip mode="warning">{text}</ModeChip>
          ) : (
            <span className="font-mono text-caption text-ink-muted tabular-nums">{text}</span>
          )}
          {props.action}
          {props.onToggle ? (
            <IconButton
              label={`Fold ${props.title}`}
              icon={<Icon name="collapse" />}
              aria-expanded={true}
              onClick={props.onToggle}
            />
          ) : null}
        </span>
      </header>
      <div
        data-slot="kanban-column-cards"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1"
      >
        {props.children || (
          <p className="m-0 text-body-sm text-ink-muted">
            {props.emptyMessage || "Nothing here yet. That's fine."}
          </p>
        )}
      </div>
      {props.footer ? <div data-slot="kanban-column-footer">{props.footer}</div> : null}
    </section>
  );
}
