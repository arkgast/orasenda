import { Button, InlineNotice } from "@orasenda/ui";
import type { ReactElement } from "react";
import type { Line } from "./useInbox";

const LINES: Record<Exclude<Line, null>, string> = {
  removed: "Note removed.",
  removeFailed: "Couldn't remove the note. It's still in your Inbox.",
  restoreFailed: "Couldn't bring the note back.",
  moved: "Moved to Board",
  moveFailed: "That didn't move. Try again.",
};

type Props = {
  failed: boolean;
  line: Line;
  onRetry(): void;
  onUndoRemove(): void;
  onUndoMove(): void;
  onOpenBoard(): void;
};

/**
 * The page's status row: the `InlineNotice` row with the line's first action as its own and, for
 * "Moved to Board", Open Board as a sibling `Button` (the Today status-row pattern).
 */
export function InboxStatus(props: Props): ReactElement {
  const { failed, line } = props;
  if (failed) {
    return (
      <InlineNotice
        variant="row"
        tone="attention"
        actionLabel="Try again"
        actionName="Try again loading the Inbox"
        onAction={props.onRetry}
      >
        Orasenda can't read your Inbox right now.
      </InlineNotice>
    );
  }
  const moved = line === "moved";
  const undoing = line === "removed" || moved;
  return (
    <div data-slot="status-row" data-actions={moved ? 2 : undefined} className="app-inbox-status">
      <InlineNotice
        variant="row"
        tone={undoing || line === null ? "neutral" : "attention"}
        actionLabel={undoing ? "Undo" : undefined}
        actionName={moved ? "Undo moving the note" : undoing ? "Undo removing the note" : undefined}
        onAction={moved ? props.onUndoMove : undoing ? props.onUndoRemove : undefined}
      >
        {line ? LINES[line] : ""}
      </InlineNotice>
      {moved ? (
        <Button variant="inline" size="row" onClick={props.onOpenBoard}>
          Open Board
        </Button>
      ) : null}
    </div>
  );
}
