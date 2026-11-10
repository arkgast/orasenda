import type { JSX } from "react";
import { Button } from "./button";
import { InlineNotice, type InlineNoticeProps } from "./inline-notice";

/** Same props as InlineNotice (default variant) plus onDismiss, which adds a visible Dismiss button. */
export interface ToastProps
  extends Omit<Extract<InlineNoticeProps, { variant?: "default" }>, "variant" | "tone"> {
  tone?: "neutral" | "warning";
  onDismiss?: () => void;
}

/** One message at the bottom centre of the window, built on InlineNotice. The component sets no expiry. */
export function Toast(props: ToastProps): JSX.Element {
  const { onDismiss, ...notice } = props;
  return (
    <div
      data-slot="toast"
      className="fixed inset-x-6 bottom-5 z-popover mx-auto flex max-w-panel-width flex-col gap-2 rounded-lg border border-line-strong bg-surface-overlay p-2 shadow-raised"
    >
      <InlineNotice {...notice} />
      {onDismiss ? (
        <Button variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      ) : null}
    </div>
  );
}
