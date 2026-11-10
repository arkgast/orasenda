import { AlertDialog, Dialog as DialogPrimitive } from "radix-ui";
import type { JSX, ReactNode } from "react";
import { useRef } from "react";
import { isTopmostLayer } from "../../lib/layer";
import { cn } from "../../lib/utils";
import { Button } from "./button";

// WebKit does not focus a button on click, so remember the last pressed control as the opener fallback. The
// Dialog is often mounted after the press, so this listens from module load.
// A press only counts while fresh: a dialog opened by a timer must not send focus to an old click.
const PRESS_TTL_MS = 1000;
let lastPress: { el: HTMLElement; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("button");
      lastPress = el ? { el, at: Date.now() } : null;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    () => {
      lastPress = null;
    },
    true,
  );
}

export interface DialogProps {
  open?: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
  scrim?: boolean;
  loading?: boolean;
}

// The overlay is a grid that centres the panel inside a space-3 gutter (Radix scrollable-overlay pattern), capped at the panel width token; padding
// and gaps are the token steps. Nothing here is a fixed size.
const content =
  "flex max-h-full w-full max-w-panel-width flex-col gap-5 overflow-auto rounded-lg border border-line-strong bg-surface-overlay p-5 text-ink shadow-overlay";

/**
 * A confirmation. Escape and the cancel button call `onCancel`; backdrop clicks never dismiss. `destructive`
 * renders a Radix AlertDialog (role alertdialog) with a critical confirm and the scrim.
 */
export function Dialog({
  open = true,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
  destructive,
  scrim,
  loading,
}: DialogProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const Prim = destructive ? AlertDialog : DialogPrimitive;
  const showScrim = !!(scrim || destructive);
  return (
    <Prim.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <Prim.Portal>
        <Prim.Overlay
          data-slot="dialog-overlay"
          data-scrim={showScrim ? "true" : "false"}
          className={cn(
            "fixed inset-0 z-overlay grid place-items-center p-3",
            showScrim ? "bg-scrim" : "bg-clear",
          )}
        >
          <Prim.Content
            aria-modal="true"
            data-slot="dialog-content"
            ref={contentRef}
            className={content}
            onOpenAutoFocus={(event) => {
              // There is no Trigger part (the host owns the trigger), so remember what had focus.
              const active = document.activeElement as HTMLElement | null;
              const press =
                lastPress && Date.now() - lastPress.at <= PRESS_TTL_MS ? lastPress.el : null;
              opener.current = active && active !== document.body ? active : press;
              event.preventDefault();
              // The cancel action is the first button of the actions row.
              actionsRef.current?.querySelector<HTMLElement>("button")?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              // Esc belongs to the topmost layer only.
              if (contentRef.current && !isTopmostLayer(contentRef.current)) event.preventDefault();
            }}
          >
            <Prim.Title data-slot="dialog-title" className="m-0 text-title text-ink">
              {title}
            </Prim.Title>
            {description ? (
              <Prim.Description
                data-slot="dialog-description"
                className="m-0 text-body text-ink-muted"
              >
                {description}
              </Prim.Description>
            ) : null}
            {children}
            <div
              data-slot="dialog-actions"
              ref={actionsRef}
              className="flex flex-wrap justify-end gap-2"
            >
              <Button variant="ghost" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button
                variant={destructive ? "critical" : "primary"}
                onClick={onConfirm}
                loading={loading}
              >
                {confirmLabel}
              </Button>
            </div>
          </Prim.Content>
        </Prim.Overlay>
      </Prim.Portal>
    </Prim.Root>
  );
}
