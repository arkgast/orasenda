import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { FocusEvent, JSX, ReactElement } from "react";
import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from "react";
import { layerContainer } from "../../lib/layer";
import { cn } from "../../lib/utils";
import { Kbd } from "./kbd";

export interface TooltipProps {
  label: string;
  shortcut?: string;
  placement?: "auto";
  children: ReactElement;
}

// Input modality. A focus shows a Tooltip only right after keyboard navigation (Tab, arrows, Home, End, Page
// keys). WebKit matches :focus-visible for focus moved by script too, so this flag decides: focus restored
// after a dialog closes, or launch focus on Start, follows no navigation key and shows nothing.
const NAV_KEYS = /^(Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/;
const modality = { keyboard: false };
if (typeof document !== "undefined") {
  const clear = () => {
    modality.keyboard = false;
  };
  document.addEventListener(
    "keydown",
    (event) => {
      modality.keyboard = NAV_KEYS.test(event.key);
    },
    true,
  );
  document.addEventListener("pointerdown", clear, true);
  document.addEventListener("mousedown", clear, true);
}

/** A token read as a number: "160ms" and "0.16s" give 160, "4px" gives 4, a missing token gives 0. */
function tokenNumber(name: string): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return /ms$/.test(raw) ? n : /s$/.test(raw) ? n * 1000 : n;
}

const panel =
  "z-popover flex w-max max-w-tooltip items-center gap-2 rounded-sm border border-line-strong bg-surface-overlay px-2 py-1 text-body-sm text-ink";

/**
 * The visible name of a control, shown on hover and on keyboard focus. The panel is aria-hidden: the trigger's
 * own name already says the label. Radix points the trigger's aria-describedby at its own hidden copy while it
 * shows (a behaviour change forced by Radix).
 */
export function Tooltip({
  label,
  shortcut,
  placement = "auto",
  children: given,
}: TooltipProps): JSX.Element {
  // The type says one element; a bare string or number (design-system sample data) is wrapped.
  const children = isValidElement(given) ? given : <span>{given}</span>;
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef(0);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // A menu trigger whose menu is open (aria-expanded true on the child) shows no tooltip, so Esc reaches the menu.
  const kid = children.props as Record<string, unknown>;
  const expanded = kid["aria-expanded"] === true || kid["aria-expanded"] === "true";
  const shown = !!label && (hover || focus) && !dismissed && !expanded;

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = 0;
    }
  }, []);
  const afterQuick = (fn: () => void) => {
    cancel();
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      fn();
    }, tokenNumber("--duration-quick"));
  };
  const enter = () => {
    if (hover) cancel();
    else afterQuick(() => setHover(true));
  };
  const leave = () => afterQuick(() => setHover(false));

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!hover && !focus && dismissed) setDismissed(false);
  }, [hover, focus, dismissed]);

  // Esc hides the tooltip without moving focus and does nothing else on that press (no dialog cancel, no host
  // key handler), unless the press comes from inside an open PopoverMenu or an element marked data-os-esc (the
  // Focus window, where Esc means Leave): then it hides the tooltip and still reaches the menu or the section.
  useEffect(() => {
    if (!shown) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const inMenu = (event.target as Element | null)?.closest?.(
        "[data-slot='popover-menu'], [data-os-esc]",
      );
      cancel();
      setDismissed(true);
      if (!inMenu) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [shown, cancel]);

  const own = children.props as {
    onPointerEnter?: (e: unknown) => void;
    onPointerLeave?: (e: unknown) => void;
    onFocus?: (e: unknown) => void;
    onBlur?: (e: unknown) => void;
  };
  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    onPointerEnter: (e: unknown) => {
      own.onPointerEnter?.(e);
      enter();
    },
    onPointerLeave: (e: unknown) => {
      own.onPointerLeave?.(e);
      leave();
    },
    onFocus: (e: FocusEvent) => {
      own.onFocus?.(e);
      anchor.current = e.currentTarget as HTMLElement;
      if (modality.keyboard) setFocus(true);
    },
    onBlur: (e: unknown) => {
      own.onBlur?.(e);
      setFocus(false);
    },
  });

  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root open={shown}>
        <TooltipPrimitive.Trigger
          asChild
          ref={(el: HTMLElement | null) => {
            anchor.current = el;
          }}
        >
          {trigger}
        </TooltipPrimitive.Trigger>
        {shown ? (
          <TooltipPrimitive.Portal container={layerContainer(anchor.current)}>
            <TooltipPrimitive.Content
              data-slot="tooltip"
              data-placement={placement}
              aria-hidden="true"
              side="bottom"
              sideOffset={tokenNumber("--space-1")}
              collisionPadding={tokenNumber("--space-2")}
              className={cn(panel)}
              // Hoverable (WCAG 1.4.13): the pointer can move onto the panel and it stays.
              onPointerEnter={enter}
              onPointerLeave={leave}
              onEscapeKeyDown={(event) => event.preventDefault()}
            >
              <span data-slot="tooltip-label" className="min-w-0">
                {label}
              </span>
              {shortcut ? <Kbd keys={shortcut} inTooltip /> : null}
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        ) : null}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
