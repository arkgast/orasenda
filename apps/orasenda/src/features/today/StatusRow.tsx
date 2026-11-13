import { Button, InlineNotice } from "@orasenda/ui";
import type { ReactElement } from "react";
import type { StatusActionId, StatusLine } from "./statusLine";

type Props = {
  /** `null` at rest: the live region stays mounted and empty. */
  line: StatusLine | null;
  onAction(id: StatusActionId): void;
};

/**
 * Today's status row: the `InlineNotice` row (its message is the one live region) with the line's
 * first action as its own, and a second as a sibling `Button` (spec: Today, status row). A new
 * text is a new node, so each line is announced once.
 */
export function StatusRow({ line, onAction }: Props): ReactElement {
  const [first, second] = line?.actions ?? [];
  return (
    <div
      data-slot="status-row"
      data-actions={line?.actions.length || undefined}
      className="today-status-row"
    >
      <InlineNotice
        key={line?.text ?? ""}
        variant="row"
        tone={line?.tone ?? "neutral"}
        actionVariant={first?.variant}
        actionLabel={first?.label}
        actionName={first?.name}
        onAction={first ? () => onAction(first.id) : undefined}
      >
        {line?.spoken ? (
          <>
            <span aria-hidden="true">{line.text}</span>
            <span className="sr-only">{line.spoken}</span>
          </>
        ) : (
          line?.text
        )}
      </InlineNotice>
      {second ? (
        <Button
          variant={second.variant}
          aria-label={second.name || undefined}
          className={second.variant === "ghost" ? "flex-none px-3 text-focus" : "flex-none px-3"}
          onClick={() => onAction(second.id)}
        >
          {second.label}
        </Button>
      ) : null}
    </div>
  );
}
