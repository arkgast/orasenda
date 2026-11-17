import { Toast } from "@orasenda/ui";
import type { ReactElement } from "react";
import type { MoveToast as MoveToastState } from "./useShutdown";

type Props = {
  toast: MoveToastState;
  onUndo(): void;
  onDismiss(): void;
};

/**
 * The line after a move, with Undo while the token lasts. It has an action, so it is never
 * auto-dismissed (toast.md): it goes on Undo, Dismiss, the next move or the end of the flow, and
 * it does not pause on hover or focus because nothing runs down.
 */
export function MoveToast({ toast, onUndo, onDismiss }: Props): ReactElement {
  return (
    // The host stops above the flow's footer, and `contain: layout` makes the toast's fixed box
    // sit inside it: the toast is at the bottom centre of the step, never over End or Continue.
    <div className="app-shutdown-toast-host">
      <Toast
        actionLabel={toast.token ? "Undo" : undefined}
        onAction={toast.token ? onUndo : undefined}
        onDismiss={onDismiss}
      >
        {toast.line}
      </Toast>
    </div>
  );
}
