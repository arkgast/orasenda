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

// Controls WebKit makes a Tab stop only under full keyboard access. Selects, date inputs and tabindex=0 are Tab stops
// either way, so they say nothing about the setting.
const FULL_ACCESS_ONLY =
  'button, a[href], summary, input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"], input[type="range"], input[type="color"]';

// WebKit scrolls a focused field into view to its own box and ignores scroll padding, which clips the focus ring.
// After focus moves inside the sheet body, nudge the body (instantly) so the field keeps the body's scroll padding.
function keepFocusClear(body: HTMLElement, target: HTMLElement): void {
  const pad = Number.parseFloat(getComputedStyle(body).scrollPaddingTop) || 0;
  const box = body.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const below = r.bottom + pad - box.bottom;
  const above = box.top - (r.top - pad);
  // A field taller than the body cannot show both ends: keep its top (and ring) in view.
  if (r.height + 2 * pad > box.height) body.scrollTop -= above;
  else if (below > 0) body.scrollTop += below;
  else if (above > 0) body.scrollTop -= above;
}

const TEXT_FIELD =
  'textarea, [contenteditable=""], [contenteditable="true"], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"], input[type="number"]';

// With macOS keyboard navigation off, WebKit's plain Tab visits only text fields. From the last one it leaves the
// Radix scope and the trap puts focus back, so focus would never move. Wrap to the first field (or, with
// Shift, the last) like native text-field cycling. Forward, with full keyboard access the Tab lands on the next
// control inside the sheet, so it only acts when focus is still where it started a frame later. Backward, Radix
// itself wraps Shift+Tab from the first field to the actions, so the wrap is made at once and Radix never sees it.
// `fullAccess.on` is set once a plain Tab has landed on a button-like control in the body (full keyboard access is on),
// after which Shift+Tab keeps the browser's own order.
function focusFirst(body: HTMLElement, to: HTMLElement): void {
  to.focus();
  if (to instanceof HTMLInputElement) to.select();
  // The first field's ring and its label fit at the top: show them whole, not just the input.
  body.scrollTop = 0;
}

function wrapTextFields(
  body: HTMLElement,
  event: KeyboardEvent,
  fullAccess: { on: boolean },
): number | undefined {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const origin = document.activeElement;
  if (!(origin instanceof HTMLElement)) return;
  const fields = [...body.querySelectorAll<HTMLElement>(TEXT_FIELD)].filter(
    (f) => !f.hasAttribute("disabled") && f.tabIndex >= 0 && f.getClientRects().length > 0,
  );
  const edge = event.shiftKey ? fields[0] : fields[fields.length - 1];
  if (fields.length < 2 || origin !== edge) return;
  const to = event.shiftKey ? fields[fields.length - 1] : fields[0];
  if (!to) return;
  if (event.shiftKey) {
    if (fullAccess.on) return;
    event.preventDefault();
    event.stopPropagation();
    to.focus();
    if (to instanceof HTMLInputElement) to.select();
    return;
  }
  return requestAnimationFrame(() => {
    if (event.defaultPrevented) return;
    const now = document.activeElement;
    const scope = body.closest("[role=dialog], [role=alertdialog]");
    // Stuck on the field, or sent out of the sheet (nothing focused): wrap.
    if (now === origin || !(now instanceof Node && scope?.contains(now))) focusFirst(body, to);
  });
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
    // Pointer focus is left to the browser, so a click never moves the field under the pointer. Only the
    // element that holds the pressed target, or the control of the label that was pressed, counts: WebKit does
    // not focus a pressed button, so the focus that follows (moved by code) is not the pointer's. A label hands
    // focus on click, after pointerup, so the press ends a frame after pointerup, on a key press or the next frame.
    let pressed: EventTarget | null = null;
    let frame = 0;
    const clear = () => {
      pressed = null;
      cancelAnimationFrame(frame);
    };
    const onPointerDown = (event: PointerEvent) => {
      clear();
      plainTab = false;
      pressed = event.target;
      frame = requestAnimationFrame(() => {
        pressed = null;
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      clear();
      pressed = event.target;
      frame = requestAnimationFrame(() => {
        pressed = null;
      });
    };
    let wrapFrame: number | undefined;
    const fullAccess = { on: false };
    let plainTab = false;
    let tabFrame = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      clear();
      plainTab = event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey;
      cancelAnimationFrame(tabFrame);
      tabFrame = requestAnimationFrame(() => {
        plainTab = false;
      });
      if (wrapFrame !== undefined) cancelAnimationFrame(wrapFrame);
      wrapFrame = wrapTextFields(body, event, fullAccess);
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      const label = pressed instanceof Element ? pressed.closest("label") : null;
      const fromPointer =
        (pressed instanceof Node && target instanceof Node && target.contains(pressed)) ||
        (label !== null && label.control === target);
      clear();
      if (plainTab && target instanceof HTMLElement && target.matches(FULL_ACCESS_ONLY))
        fullAccess.on = true;
      plainTab = false;
      if (!fromPointer && target instanceof HTMLElement) keepFocusClear(body, target);
    };
    body.addEventListener("pointerdown", onPointerDown, true);
    body.addEventListener("pointerup", onPointerUp, true);
    body.addEventListener("keydown", onKeyDown, true);
    body.addEventListener("focusin", onFocusIn);
    return () => {
      body.removeEventListener("pointerdown", onPointerDown, true);
      body.removeEventListener("pointerup", onPointerUp, true);
      body.removeEventListener("keydown", onKeyDown, true);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(tabFrame);
      if (wrapFrame !== undefined) cancelAnimationFrame(wrapFrame);
      body.removeEventListener("focusin", onFocusIn);
    };
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
