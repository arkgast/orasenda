import { AlertDialog, Dialog as DialogPrimitive } from "radix-ui";
import type { JSX, ReactNode, RefObject } from "react";
import { useCallback, useId, useRef } from "react";
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

// WebKit scrolls a focused field into view to its own box and ignores scroll padding, which clips the focus ring.
// After focus moves inside the sheet body, nudge the body (instantly) so the field keeps the body's scroll padding.
function keepFocusClear(body: HTMLElement, target: HTMLElement): void {
  const pad = Number.parseFloat(getComputedStyle(body).scrollPaddingTop) || 0;
  const box = body.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const below = r.bottom + pad - box.bottom;
  const above = box.top - (r.top - pad);
  if (below > 0) body.scrollTop += below;
  else if (above > 0) body.scrollTop -= above;
}

interface DialogBaseProps {
  open?: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Disables the confirm and shows this reason under the actions, linked to it. */
  confirmDisabledReason?: string;
  cancelLabel?: string;
  onCancel: () => void;
  destructive?: boolean;
  scrim?: boolean;
  loading?: boolean;
  /** "sheet" is the wide task sheet: capped at sheet-width, always over the scrim, with a two-column body. */
  size?: "panel" | "sheet";
  /** The element that takes focus on open instead of the cancel action; the sheet uses it for its first field. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

// The overlay is a grid that centres the panel inside a space-3 gutter (Radix scrollable-overlay pattern), capped at the panel width token; padding
// and gaps are the token steps. Nothing here is a fixed size.
/** Without a confirm label there is no confirm button (the import sheet's source step); with one, a handler is required. */
type DialogConfirmProps =
  | { confirmLabel: string; onConfirm: () => void }
  | { confirmLabel?: undefined; onConfirm?: undefined };

export type DialogProps = DialogBaseProps & DialogConfirmProps;

const content =
  "flex max-h-full w-full scroll-py-3 flex-col gap-5 rounded-lg border border-line-strong bg-surface-overlay p-5 text-ink shadow-overlay";

const PANEL_WIDTH = "max-w-panel-width";
const SHEET_WIDTH = "max-w-sheet-width";

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
  confirmDisabledReason,
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
  destructive,
  scrim,
  loading,
  size = "panel",
  initialFocusRef,
}: DialogProps): JSX.Element {
  const reasonId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const Prim = destructive ? AlertDialog : DialogPrimitive;
  const sheet = size === "sheet";
  const showScrim = !!(scrim || destructive || sheet);
  // A native listener on a callback ref: the body mounts inside the portal, after this component's own effects,
  // and it is a scroll container, not a control, so it takes no React event prop.
  const watchFocus = useCallback((body: HTMLDivElement | null) => {
    if (!body) return;
    body.addEventListener("focusin", (event) => keepFocusClear(body, event.target as HTMLElement));
  }, []);
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
            data-size={size}
            className={cn(
              content,
              sheet ? `${SHEET_WIDTH} overflow-hidden` : `${PANEL_WIDTH} overflow-auto`,
            )}
            onOpenAutoFocus={(event) => {
              // There is no Trigger part (the host owns the trigger), so remember what had focus.
              const active = document.activeElement as HTMLElement | null;
              const press =
                lastPress && Date.now() - lastPress.at <= PRESS_TTL_MS ? lastPress.el : null;
              opener.current = active && active !== document.body ? active : press;
              event.preventDefault();
              // The cancel action is the first button of the actions row, unless the host named a field.
              const target =
                initialFocusRef?.current ??
                actionsRef.current?.querySelector<HTMLElement>("button");
              target?.focus();
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
            {sheet ? (
              <div
                data-slot="dialog-sheet-body"
                ref={watchFocus}
                className="@container -m-2 min-h-0 flex-1 scroll-py-3 overflow-auto p-2"
              >
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 @sheet-stack:grid-cols-2">
                  {children}
                </div>
              </div>
            ) : (
              children
            )}
            <div className="flex flex-col gap-2">
              <div
                data-slot="dialog-actions"
                ref={actionsRef}
                className="flex flex-wrap justify-end gap-2"
              >
                <Button variant="ghost" onClick={onCancel}>
                  {cancelLabel}
                </Button>
                {confirmLabel ? (
                  <Button
                    variant={destructive ? "critical" : "primary"}
                    onClick={onConfirm}
                    loading={loading}
                    disabled={!!confirmDisabledReason}
                    aria-describedby={confirmDisabledReason ? reasonId : undefined}
                  >
                    {confirmLabel}
                  </Button>
                ) : null}
              </div>
              {confirmLabel && confirmDisabledReason ? (
                <p
                  id={reasonId}
                  data-slot="dialog-reason"
                  className="m-0 text-end text-body-sm text-ink-muted"
                >
                  {confirmDisabledReason}
                </p>
              ) : null}
            </div>
          </Prim.Content>
        </Prim.Overlay>
      </Prim.Portal>
    </Prim.Root>
  );
}
