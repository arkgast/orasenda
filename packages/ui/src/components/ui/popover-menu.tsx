import { DropdownMenu } from "radix-ui";
import {
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  useId,
  useLayoutEffect,
  useState,
} from "react";
import { layerContainer } from "../../lib/layer";
import { cn } from "../../lib/utils";
import { Kbd } from "./kbd";

export interface PopoverMenuItem {
  id: string;
  label: string;
  meta?: string;
  kind: "radio" | "checkbox" | "link";
  checked?: boolean;
  disabled?: boolean;
}

/** The preset popover (PopoverMenu README). Render it only while open; the host owns open. */
export interface PopoverMenuProps {
  heading: string;
  description?: string;
  items: PopoverMenuItem[];
  readOnly?: boolean;
  /** Called with the chosen row's id, then onClose. */
  onSelect: (id: string) => void;
  /** Esc, Tab, a press outside, or after onSelect. The host sets open to false. */
  onClose: () => void;
  /** The id of the role="menu" element, for the trigger's aria-controls; otherwise useId(). The heading and description use <id>-heading and <id>-desc. */
  id?: string;
  /** The trigger, or an element that holds it (an IconButton takes no ref: wrap it in a span with the ref). */
  anchor: RefObject<HTMLElement | null>;
  /** true: the heading row shows P as an aria-hidden Kbd, and the host adds P to the trigger's aria-keyshortcuts. Omitted or false: neither. Pass it only while single-key shortcuts are on; the menu never listens for P. */
  singleKeys?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A token read as a number of pixels (Radix places in numbers): "4px" gives 4, a missing token gives 0.
function tokenPx(name: string): number {
  if (typeof document === "undefined") return 0;
  const n = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
  );
  return Number.isFinite(n) ? n : 0;
}

const focusTarget = (a: HTMLElement | null | undefined): HTMLElement | null =>
  !a ? null : a.matches(FOCUSABLE) ? a : a.querySelector<HTMLElement>(FOCUSABLE);

// Tab out of a menu (WAI-ARIA APG): the next tabbable element after the trigger in DOM order, inside the layer
// that holds the trigger, never inside the menu. None: null (focus goes back to the trigger).
function nextTabbable(from: HTMLElement | null, menu: HTMLElement | null): HTMLElement | null {
  if (!from) return null;
  const scope = layerContainer(from);
  for (const n of scope.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (
      n.hasAttribute("data-radix-focus-guard") ||
      n === from ||
      from.contains(n) ||
      menu?.contains(n) ||
      n.tabIndex < 0
    )
      continue;
    if (n.closest("[hidden],[inert],[aria-hidden='true']")) continue;
    if (from.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) return n;
  }
  return null;
}

// The Radix Trigger is the only part that tells the menu where to place itself, and the trigger here is the
// host's. This part renders nothing: it hands the host's element to the ref Radix gives the Trigger, so Radix
// places the menu against it (flip, shift, scroll and resize) and never writes the host's attributes.
function AnchorProxy({ anchor, ref }: { anchor: HTMLElement | null; ref?: Ref<HTMLElement> }) {
  useLayoutEffect(() => {
    const set = (node: HTMLElement | null) => {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };
    set(anchor);
    return () => set(null);
  }, [anchor, ref]);
  return null;
}

// The inset ring: the legacy base focus rule (unlayered, offset 2px) is stronger than a layered utility, so the
// offset is important until that rule leaves with the last legacy component.
const row =
  "group flex min-h-hit-min w-full cursor-pointer items-center gap-3 px-4 text-start text-body text-ink outline-focus-ring focus-visible:-outline-offset-2! focus-visible:outline-2 hover:bg-surface-sunken aria-checked:bg-selection aria-checked:hover:bg-selection aria-disabled:cursor-default aria-disabled:text-ink-muted aria-disabled:hover:bg-clear aria-checked:aria-disabled:hover:bg-selection";
const mark =
  "grid size-icon-md flex-none place-items-center border-2 border-line-strong bg-surface-overlay forced-colors:forced-color-adjust-none group-aria-checked:border-focus group-aria-checked:bg-focus group-aria-disabled:border-dashed";

function Row({
  item,
  live,
  onChoose,
}: {
  item: PopoverMenuItem;
  live: boolean;
  onChoose: (item: PopoverMenuItem) => void;
}): JSX.Element {
  const common = {
    "data-slot": "popover-menu-item",
    className: row,
    "aria-disabled": live ? undefined : ("true" as const),
    onSelect: (event: Event) => {
      // Never chosen while waiting; and the host, not Radix, decides when the menu closes.
      event.preventDefault();
      if (live) onChoose(item);
    },
  };
  const label = <span className="min-w-0">{item.label}</span>;
  const meta = item.meta ? (
    <span className="ms-auto font-medium font-mono text-body-sm text-ink-muted tabular-nums">
      {item.meta}
    </span>
  ) : null;
  if (item.kind === "radio") {
    return (
      <DropdownMenu.RadioItem value={item.id} {...common}>
        <span
          aria-hidden="true"
          data-slot="popover-menu-mark"
          className={cn(
            mark,
            "rounded-pill group-aria-checked:inset-ring-2 group-aria-checked:inset-ring-surface-overlay",
          )}
        />
        {label}
        {meta}
      </DropdownMenu.RadioItem>
    );
  }
  if (item.kind === "checkbox") {
    return (
      <DropdownMenu.CheckboxItem checked={!!item.checked} {...common}>
        <span aria-hidden="true" data-slot="popover-menu-mark" className={cn(mark, "rounded-sm")}>
          {item.checked ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              focusable="false"
              className="size-full fill-none stroke-2 stroke-on-focus"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5.5 10.5l3 3 6-7" />
            </svg>
          ) : null}
        </span>
        {label}
        {meta}
        <span
          aria-hidden="true"
          className={cn("text-body-sm text-ink-muted", item.meta ? "ms-0" : "ms-auto")}
        >
          {item.checked ? "On" : "Off"}
        </span>
      </DropdownMenu.CheckboxItem>
    );
  }
  return (
    <DropdownMenu.Item {...common}>
      {label}
      {meta}
    </DropdownMenu.Item>
  );
}

/**
 * The one in-webview menu, for a choice (PopoverMenu README). A Radix DropdownMenu, open while rendered; the
 * host owns the trigger and its aria-expanded and aria-controls. It portals into the topmost open layer (a Dialog)
 * or the body, and is placed against `anchor`.
 */
export function PopoverMenu({
  heading,
  description,
  items,
  readOnly,
  onSelect,
  onClose,
  id,
  anchor,
  singleKeys,
}: PopoverMenuProps): JSX.Element {
  const generated = useId();
  const menuId = id || generated;
  const headingId = `${menuId}-heading`;
  const descId = `${menuId}-desc`;
  // The host usually mounts the trigger before it opens the menu; if both mount together the ref is set only
  // after this render, so read it again once the tree is committed.
  const [trigger, setTrigger] = useState(anchor.current);
  useLayoutEffect(() => setTrigger(anchor.current), [anchor]);
  const themed = trigger?.closest("[data-theme]") ?? null;
  const theme =
    themed && themed !== document.documentElement ? themed.getAttribute("data-theme") : null;
  const checkedRadio = items.find((i) => i.kind === "radio" && i.checked);

  const back = () => {
    const t = focusTarget(anchor.current);
    if (t?.isConnected) t.focus();
  };
  const close = () => {
    back();
    onClose();
  };
  const choose = (item: PopoverMenuItem) => {
    back();
    onSelect(item.id);
    onClose();
  };
  const live = (item: PopoverMenuItem) => !item.disabled && !(readOnly && item.kind !== "link");

  // The menu's keys stop here, so a page key such as Space for Pause never sees them. Radix has handled the
  // arrows, Home, End, Return and Space on the row by now. Tab is not a Radix key: it closes.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const k = event.key;
    if (k === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const next = event.shiftKey
        ? null
        : nextTabbable(focusTarget(anchor.current), event.currentTarget);
      if (next) {
        next.focus();
        onClose();
      } else close();
    } else if (/^(ArrowUp|ArrowDown|Home|End|Enter| |Spacebar)$/.test(k)) event.stopPropagation();
  };

  // Menu supports onOpenAutoFocus and DropdownMenu spreads it through, but its props type leaves it out.
  const openFocus = {
    onOpenAutoFocus: (event: Event) => {
      // Focus moves to the checked radio, or the first row.
      event.preventDefault();
      const el = event.currentTarget as HTMLElement;
      const first =
        el.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ??
        el.querySelector<HTMLElement>('[role^="menuitem"]');
      first?.focus({ preventScroll: true });
    },
  } as object;

  const list: ReactNode[] = [];
  items.forEach((item, i) => {
    if (item.kind === "link" && i > 0 && items[i - 1]?.kind !== "link")
      list.push(
        <DropdownMenu.Separator
          key={`sep-${item.id}`}
          data-slot="popover-menu-separator"
          className="my-2 h-px self-stretch bg-line"
        />,
      );
    list.push(<Row key={item.id} item={item} live={live(item)} onChoose={choose} />);
  });

  return (
    <DropdownMenu.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenu.Trigger asChild>
        <AnchorProxy anchor={trigger} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={layerContainer(trigger)}>
        <DropdownMenu.Content
          id={menuId}
          data-slot="popover-menu"
          data-theme={theme ?? undefined}
          aria-labelledby={headingId}
          aria-describedby={description ? descId : undefined}
          side="bottom"
          align="start"
          sideOffset={tokenPx("--space-1")}
          collisionPadding={tokenPx("--space-2")}
          loop
          className="z-popover flex max-h-screen w-popover-width max-w-screen flex-col overflow-y-auto rounded-md border border-line-strong bg-surface-overlay py-2 text-body text-ink shadow-overlay"
          onKeyDown={onKeyDown}
          {...openFocus}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            // One Esc press closes the menu and goes no further (no dialog, no page key).
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
          onPointerDownOutside={(event) => {
            // A press on the trigger is the host's: its click toggles the menu. Any other press outside closes
            // it and leaves focus where the press put it.
            if (anchor.current?.contains(event.target as Node)) event.preventDefault();
          }}
          onFocusOutside={(event) => event.preventDefault()}
        >
          <div data-slot="popover-menu-head" className="flex flex-col gap-1 px-4 py-2">
            <div className="flex items-center gap-2">
              <p
                id={headingId}
                aria-hidden="true"
                data-slot="popover-menu-heading"
                className="text-body-sm font-semibold text-ink"
              >
                {heading}
              </p>
              {singleKeys === true ? (
                <span className="ms-auto flex-none">
                  <Kbd keys="P" inTooltip />
                </span>
              ) : null}
            </div>
            {description ? (
              <p
                id={descId}
                aria-hidden="true"
                data-slot="popover-menu-description"
                className="text-body-sm text-ink-muted"
              >
                {description}
              </p>
            ) : null}
          </div>
          <DropdownMenu.RadioGroup
            role="none"
            value={checkedRadio?.id ?? ""}
            className="flex flex-col"
          >
            {list}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
