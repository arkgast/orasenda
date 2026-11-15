import { Children, type ReactElement, type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { ModeChip } from "./mode-chip";

interface KanbanColumnBase {
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
  /** On the region, so the board can move focus between columns. */
  id?: string;
}

/** A folded column is a button, so it always has onToggle. */
export type KanbanColumnProps = KanbanColumnBase &
  ({ collapsed?: false; onToggle?: () => void } | { collapsed: true; onToggle: () => void });

function whole(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** "2 of 3" under the limit, "At limit" at it (both plain captions); over it the caption is a chip. */
function caption(n: number, limit: number | null): { text: string; over: boolean } {
  if (limit == null) return { text: `${n} ${n === 1 ? "task" : "tasks"}`, over: false };
  if (n > limit) return { text: `${n} of ${limit}`, over: true };
  return { text: n === limit ? "At limit" : `${n} of ${limit}`, over: false };
}

/** A board column: heading, a count against the user's limit, and the cards. */
export function KanbanColumn(props: KanbanColumnProps): ReactElement {
  const headingId = useId();
  const n = whole(props.count);
  const limit = props.limit == null ? null : whole(props.limit);
  const { text, over } = caption(n, limit);
  const strip = useRef<HTMLButtonElement>(null);
  const foldedByUs = useRef(false);
  // Folding unmounts the focused Fold button; put focus on the strip that replaces it.
  useEffect(() => {
    if (props.collapsed && foldedByUs.current) strip.current?.focus();
    foldedByUs.current = false;
  }, [props.collapsed]);
  if (props.collapsed) {
    return (
      <button
        type="button"
        ref={strip}
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
        <span aria-hidden="true" className="text-label break-words">
          {props.title}
        </span>
        <span
          aria-hidden="true"
          className="font-mono text-caption text-ink-muted tabular-nums group-hover:text-ink"
        >
          {over ? (
            <span data-slot="kanban-column-strip-over" className="flex flex-col items-center">
              <Icon name="alert" />
              {n}
            </span>
          ) : (
            n
          )}
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
        "flex min-h-0 min-w-column-min-width flex-col gap-3 rounded-lg bg-surface-sunken p-3",
        props.width === "wide"
          ? "max-w-column-wide-width grow-2 basis-column-width"
          : "max-w-column-width grow basis-column-min-width",
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
              onClick={() => {
                foldedByUs.current = true;
                props.onToggle?.();
              }}
            />
          ) : null}
        </span>
      </header>
      <div
        data-slot="kanban-column-cards"
        className="flex min-h-0 flex-1 flex-col gap-2 scroll-py-1 overflow-y-auto p-1"
      >
        {Children.toArray(props.children).length > 0 ? (
          props.children
        ) : (
          <p className="m-0 text-body-sm text-ink-muted">
            {props.emptyMessage || "Nothing here yet. That's fine."}
          </p>
        )}
      </div>
      {props.footer ? <div data-slot="kanban-column-footer">{props.footer}</div> : null}
    </section>
  );
}
