import type { ReactElement } from "react";
import { useId } from "react";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { ModeChip } from "./mode-chip";

export interface KanbanColumnHeaderProps {
  headingId: string;
  title: string;
  /** The count caption ("2 of 3", "At limit", "3 tasks"). */
  text: string;
  /** Over the limit: the caption is a warning chip. */
  over: boolean;
  onEdit?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  /** Called when the Fold button is pressed (the column notes that it folded itself first). */
  onFold?: () => void;
}

/** The name: plain heading text, or with onEdit a quiet button that opens on double-click or Return. */
function Name(
  props: Pick<KanbanColumnHeaderProps, "headingId" | "title" | "onEdit">,
): ReactElement {
  const hintId = useId();
  const { onEdit } = props;
  return (
    <h2 id={props.headingId} className="m-0 min-w-0 flex-1 text-heading wrap-anywhere">
      {onEdit ? (
        <>
          <button
            type="button"
            data-slot="kanban-column-name"
            aria-describedby={hintId}
            // A pointer click (detail >= 1) does nothing; Return, Space and VoiceOver's activate
            // arrive as a click with detail 0.
            onClick={(e) => {
              if (e.detail === 0) onEdit();
            }}
            onDoubleClick={onEdit}
            className="m-0 -ms-2 min-h-hit-min w-full cursor-text rounded-md border-0 bg-clear px-2 text-start text-heading text-ink outline-focus-ring outline-offset-2 transition-colors duration-quick ease-calm hover:bg-surface-sunken focus-visible:outline-2 motion-reduce:transition-none"
          >
            {props.title}
          </button>
          <span id={hintId} className="sr-only">
            Double-click or press Return to edit the column.
          </span>
        </>
      ) : (
        props.title
      )}
    </h2>
  );
}

/** Row one: the name, with Fold top-right. Row two: the count (or chip), with + at the end. */
export function KanbanColumnHeader(props: KanbanColumnHeaderProps): ReactElement {
  return (
    <header className="flex flex-col gap-1">
      <div data-slot="kanban-column-header-row" className="flex items-start justify-between gap-2">
        <Name headingId={props.headingId} title={props.title} onEdit={props.onEdit} />
        {props.onFold ? (
          <span data-slot="kanban-column-fold" className="contents">
            <IconButton
              label={`Fold ${props.title}`}
              icon={<Icon name="collapse" />}
              aria-expanded={true}
              onClick={props.onFold}
            />
          </span>
        ) : null}
      </div>
      <div
        data-slot="kanban-column-header-row"
        className="flex min-h-hit-min items-center justify-between gap-2"
      >
        {props.over ? (
          <ModeChip mode="warning">{props.text}</ModeChip>
        ) : (
          <span className="font-mono text-caption text-ink-muted tabular-nums">{props.text}</span>
        )}
        {props.onAdd ? (
          <span data-slot="kanban-column-add" className="contents">
            <IconButton
              label={props.addLabel ?? `Add task to ${props.title}`}
              icon={<Icon name="plus" />}
              onClick={props.onAdd}
            />
          </span>
        ) : null}
      </div>
    </header>
  );
}
