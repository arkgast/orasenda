import type { JSX, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";
import { ModeShape } from "./mode-shape";

/** variant 'row' is the reserved 44px status row; tone 'attention' (alert glyph) and 'rest' (ink-muted, no glyph) are for that row only. actionName is the accessible name when it differs from the visible actionLabel (e.g. "Try again saving break minutes"). */
export type InlineNoticeProps = {
  children: ReactNode;
  actionLabel?: string;
  actionName?: string;
  onAction?: () => void;
} & (
  | {
      variant?: "default";
      tone?: "neutral" | "warning";
      /** Defaults to 'ghost' (the default variant's action stays a ghost Button); 'quiet' gives the first action a border (for an optional suggestion's accept). */
      actionVariant?: "quiet" | "ghost";
      /** A second, quiet action after the first (for "Keep as is"). `name` is the accessible name when it differs from `label`. */
      secondaryAction?: { label: string; name?: string; onAction: () => void };
    }
  | {
      variant: "row";
      tone?: "neutral" | "attention" | "rest" | "warning";
      /** Defaults to 'ghost', which renders the row action as an inline/row Button; 'quiet' renders quiet/row. */
      actionVariant?: "quiet" | "ghost";
      /** The row takes no height while it is empty (no message and no action); the live region stays mounted. */
      collapseEmpty?: boolean;
    }
);

/** A quiet line of guidance; as variant 'row', the reserved status row. The message is the live region. */
export function InlineNotice(props: InlineNoticeProps): JSX.Element {
  const hasAction = Boolean(props.actionLabel && props.onAction);
  if (props.variant === "row") {
    const tone =
      props.tone === "attention" || props.tone === "warning" || props.tone === "rest"
        ? props.tone
        : "neutral";
    return (
      // The 44px height is a hit target and stays fixed.
      <div
        data-slot="inline-notice"
        data-variant="row"
        data-tone={tone}
        className={cn(
          "flex min-w-0 items-center gap-3",
          props.collapseEmpty && !props.children && !hasAction
            ? "h-0 overflow-hidden"
            : "h-hit-min",
        )}
      >
        <p
          data-slot="inline-notice-message"
          role="status"
          aria-live="polite"
          className={cn(
            "m-0 flex min-w-0 flex-1 items-center gap-2 text-body-sm",
            tone === "rest" ? "text-ink-muted" : "text-ink",
          )}
        >
          {tone === "attention" ? <Icon name="alert" size="md" /> : null}
          {tone === "warning" ? (
            <span className="inline-flex text-amber">
              <ModeShape mode="warning" />
            </span>
          ) : null}
          {props.children}
        </p>
        {hasAction ? (
          <Button
            variant={props.actionVariant === "quiet" ? "quiet" : "inline"}
            size="row"
            aria-label={props.actionName || undefined}
            onClick={props.onAction}
          >
            {props.actionLabel}
          </Button>
        ) : null}
      </div>
    );
  }
  const warning = props.tone === "warning";
  const second = props.secondaryAction;
  return (
    <div
      data-slot="inline-notice"
      data-variant="default"
      data-tone={warning ? "warning" : "neutral"}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border border-line-strong px-4 py-3",
        warning ? "bg-amber-soft text-amber" : "bg-surface-raised text-ink",
      )}
    >
      <div
        data-slot="inline-notice-message"
        role="status"
        aria-atomic="true"
        className="flex flex-auto items-baseline gap-2"
      >
        <ModeShape mode={warning ? "warning" : "shallow"} />
        <span>{props.children}</span>
      </div>
      {hasAction ? (
        <Button
          variant={props.actionVariant === "quiet" ? "quiet" : "ghost"}
          aria-label={props.actionName || undefined}
          onClick={props.onAction}
        >
          {props.actionLabel}
        </Button>
      ) : null}
      {second ? (
        <Button variant="quiet" aria-label={second.name || undefined} onClick={second.onAction}>
          {second.label}
        </Button>
      ) : null}
    </div>
  );
}
