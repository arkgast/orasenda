import { Children, type ReactElement, type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { KanbanColumnHeader } from "./kanban-column-header";

interface KanbanColumnBase {
  title: string;
  count: number;
  limit?: number;
  children?: ReactNode;
  emptyMessage?: string;
  /** Sits under the cards, inside the column (an "Add task" control). */
  footer?: ReactNode;
  /** The + in the header's second row, named "Add task to <title>"; absent without it. */
  onAdd?: () => void;
  /** Overrides the + button's name. */
  addLabel?: string;
  /** Makes the name a quiet button: a double-click or Return calls it. Without it the name is plain text. */
  onEdit?: () => void;
  /** While set, replaces both header rows (the Fold button too); the cards stay. */
  editor?: ReactNode;
  /** "wide" grows to column-wide-width (Today and Doing in the Today-first board). */
  width?: "standard" | "wide";
  /** On the region, so the board can move focus between columns. */
  id?: string;
  /**
   * A drag is over this column: a dashed slot reading `label`, inserted before the child at
   * `index` in `children` as passed (past the end appends). The caller counts; on a folded strip
   * `index` is ignored.
   */
  drop?: { index: number; label: string };
}

/** The dashed well where the dragged card will land. The board's status line says it aloud. */
function DropSlot({ label }: { label: string }) {
  return (
    <div
      data-slot="kanban-column-drop"
      aria-hidden="true"
      className="flex min-h-hit-min shrink-0 items-center transition-all duration-calm ease-calm motion-reduce:transition-none starting:min-h-0 starting:py-0 rounded-md border-2 border-dashed border-line-strong px-3 py-2 text-body-sm text-ink wrap-anywhere"
    >
      {label}
    </div>
  );
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
  const kids: ReactNode[] = Children.toArray(props.children);
  if (props.drop && !props.collapsed) {
    // The caller works out the index into the children as passed; past the end appends.
    const at = Math.min(whole(props.drop.index), kids.length);
    kids.splice(at, 0, <DropSlot key="kanban-column-drop" label={props.drop.label} />);
  }
  if (props.collapsed) {
    return (
      <button
        type="button"
        ref={strip}
        id={props.id}
        data-slot="kanban-column-strip"
        aria-expanded="false"
        aria-label={`${props.title}, ${text}${props.drop ? ", Move here" : ""}`}
        onClick={props.onToggle}
        className={cn(
          "group flex w-column-strip-width flex-none cursor-pointer flex-col items-center gap-3 self-stretch rounded-lg border-0 p-3 text-ink outline-focus-ring outline-offset-2 transition-colors duration-quick ease-calm hover:inset-ring-1 hover:inset-ring-line-strong focus-visible:outline-2 active:bg-selection motion-reduce:transition-none",
          props.drop ? "bg-selection inset-ring-1 inset-ring-line-strong" : "bg-surface-sunken",
        )}
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
        {props.drop ? (
          <span aria-hidden="true" className="text-label break-words">
            Move here
          </span>
        ) : null}
      </button>
    );
  }
  return (
    <section
      data-slot="kanban-column"
      id={props.id}
      aria-labelledby={props.editor ? undefined : headingId}
      aria-label={props.editor ? props.title : undefined}
      className={cn(
        "flex min-h-0 min-w-column-min-width flex-col gap-3 rounded-lg bg-surface-sunken p-3",
        props.width === "wide"
          ? "max-w-column-wide-width grow-2 basis-column-width"
          : "max-w-column-width grow basis-column-min-width",
      )}
    >
      {props.editor ? (
        <div
          data-slot="kanban-column-editor"
          className="flex min-h-0 shrink flex-col overflow-y-auto scroll-py-1 p-1"
        >
          {props.editor}
        </div>
      ) : (
        <KanbanColumnHeader
          headingId={headingId}
          title={props.title}
          text={text}
          over={over}
          onEdit={props.onEdit}
          onAdd={props.onAdd}
          addLabel={props.addLabel}
          onFold={
            props.onToggle
              ? () => {
                  foldedByUs.current = true;
                  props.onToggle?.();
                }
              : undefined
          }
        />
      )}
      <div
        data-slot="kanban-column-cards"
        className="flex min-h-0 flex-1 flex-col gap-2 scroll-py-1 overflow-y-auto p-1"
      >
        {kids.length > 0 ? (
          kids
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
