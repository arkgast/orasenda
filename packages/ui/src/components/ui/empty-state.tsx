import type { ReactElement } from "react";
import { Button } from "./button";

/** 'inline' sits inside a SettingsRow: one line, no action. */
export type EmptyStateProps =
  | {
      title?: string;
      message?: string;
      actionLabel?: string;
      onAction?: () => void;
      variant?: "default";
    }
  | {
      title?: never;
      message?: string;
      variant: "inline";
      actionLabel?: never;
      onAction?: never;
    };

/** An empty Inbox, Today or Review: a heading, one kind sentence and at most one quiet action. */
export function EmptyState(props: EmptyStateProps): ReactElement {
  if (props.variant === "inline") {
    return (
      <p data-slot="empty-state" data-variant="inline" className="m-0 text-body-sm text-ink-muted">
        {props.message || "Nothing here yet."}
      </p>
    );
  }
  return (
    <div
      data-slot="empty-state"
      data-variant="default"
      className="flex max-w-panel-width flex-col items-start gap-fluid-stack p-fluid-gutter"
    >
      <h2 className="m-0 text-heading text-ink">{props.title || "Nothing here yet"}</h2>
      <p className="m-0 text-body text-ink-muted">
        {props.message || "That's fine. Start when you're ready."}
      </p>
      {props.actionLabel && props.onAction ? (
        <Button onClick={props.onAction}>{props.actionLabel}</Button>
      ) : null}
    </div>
  );
}
