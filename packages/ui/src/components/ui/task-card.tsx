import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useId,
  useRef,
  useState,
} from "react";
import { useTightHeight } from "../../lib/use-tight-height";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { ModeChip } from "./mode-chip";
import { PopoverMenu, type PopoverMenuItem } from "./popover-menu";

/** The card's actions: where it can move, Frog, Remove. Each callback is optional except onMove. */
export interface TaskCardMenu {
  moveTargets: { id: string; label: string }[];
  onMove: (id: string) => void;
  onFrog?: () => void;
  onRemove?: () => void;
}

export interface TaskCardProps {
  title: string;
  type?: "deep" | "shallow";
  estimate?: number;
  done?: number;
  tracked?: string;
  project?: string;
  frog?: boolean;
  active?: boolean;
  selected?: boolean;
  /** The card is being dragged: a dashed edge and the word "Moving" (never opacity). */
  moving?: boolean;
  disabled?: boolean;
  onOpen?: () => void;
  /** A click selects (selection ground + "Selected"); with onOpen, Return or a double-click opens. */
  onSelect?: () => void;
  /** "row" is the 44px TaskRow of the narrow Backlog list. */
  density?: "card" | "row";
  tags?: string[];
  /** Worded by the host: "Due Friday", "Due today". */
  due?: string;
  priority?: "high" | "medium" | "low";
  checklist?: { done: number; total: number };
  /** Passed through, so the board can move selection with the arrow keys. */
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  menu?: TaskCardMenu;
  /** The More actions button's tab index. A card that roves passes -1, so the card is one tab stop and ⇧F10 or ContextMenu opens its menu. Default 0. */
  menuTabIndex?: 0 | -1;
}

const PRIORITY: Record<"high" | "medium" | "low", string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
const MAX_TAGS = 2;

const MAX_DOTS = 12;

function count(n: number | undefined): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n as number)) : 0;
}

function accessibleName(props: TaskCardProps, tags: string[]): string {
  const est = count(props.estimate);
  const parts = [
    props.title,
    props.type === "shallow" ? "Shallow" : "Deep",
    props.frog ? "Frog" : "",
    `${count(props.done)} sessions done`,
    props.estimate != null ? `${est} estimated` : "no estimate",
    props.tracked ?? "",
    props.project ?? "",
    props.due ?? "",
    props.priority ? `${PRIORITY[props.priority]} priority` : "",
    tags.join(", "),
    props.checklist
      ? `${count(props.checklist.done)} of ${count(props.checklist.total)} checklist items done`
      : "",
    props.active ? "In progress" : "",
    props.selected ? "Selected" : "",
    props.moving ? "Moving" : "",
  ];
  return parts.filter(Boolean).join(", ");
}

function Dots({
  est,
  done,
  hasEstimate,
  nowrap,
}: {
  est: number;
  done: number;
  hasEstimate: boolean;
  nowrap?: boolean;
}) {
  const dots = [];
  for (let i = 0; i < Math.min(MAX_DOTS, Math.max(est, done)); i++) {
    const over = hasEstimate && i >= est && i < done;
    dots.push(
      <span
        key={i}
        data-slot="task-card-dot"
        data-done={i < done ? "" : undefined}
        data-over={over ? "" : undefined}
        className={cn(
          "size-icon-sm flex-none rounded-pill forced-colors:border",
          i >= done && "border-2 border-line-strong",
          i < done && "bg-focus",
          over && "border border-line-strong inset-ring-2 inset-ring-surface-raised",
        )}
      />,
    );
  }
  return (
    <span
      aria-hidden="true"
      data-slot="task-card-dots"
      className={cn("inline-flex gap-1-5", nowrap ? "min-w-0 shrink overflow-hidden" : "flex-wrap")}
    >
      {dots}
    </span>
  );
}

/** The ⋯ button and its menu. A sibling of the card, never inside its button. */
function CardMenu(props: {
  title: string;
  menu: TaskCardMenu;
  frog?: boolean;
  tabIndex: 0 | -1;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Where focus goes when the menu was opened by key: the card. Omitted for a click. */
  returnFocus?: RefObject<HTMLElement | null>;
  onToggle: () => void;
}) {
  const { title, menu, frog, open, setOpen } = props;
  const anchor = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const items: PopoverMenuItem[] = [
    ...menu.moveTargets.map((t) => ({
      id: `move:${t.id}`,
      label: `Move to ${t.label}`,
      kind: "link" as const,
    })),
    ...(menu.onFrog
      ? [{ id: "frog", label: frog ? "Unmark Frog" : "Make Frog", kind: "link" as const }]
      : []),
    ...(menu.onRemove ? [{ id: "remove", label: "Remove", kind: "link" as const }] : []),
  ];
  const choose = (id: string) => {
    if (id.startsWith("move:")) menu.onMove(id.slice(5));
    else if (id === "frog") menu.onFrog?.();
    else if (id === "remove") menu.onRemove?.();
  };
  return (
    <span ref={anchor} data-slot="task-card-menu" className="flex-none">
      <IconButton
        label={`More actions for ${title}`}
        icon={<Icon name="menu" />}
        shortcut="⇧F10"
        tabIndex={props.tabIndex}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={props.onToggle}
      />
      {open ? (
        <PopoverMenu
          id={menuId}
          heading={title}
          items={items}
          anchor={anchor}
          returnFocus={props.returnFocus}
          onSelect={choose}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </span>
  );
}

/** A task on the board. A native button when it can open or select, a read-only article when it cannot. */
export function TaskCard(props: TaskCardProps): ReactElement {
  const { title, onOpen, onSelect, active, selected } = props;
  const row = props.density === "row";
  const interactive = Boolean(onOpen || onSelect);
  const hasMenu = Boolean(props.menu) && !props.disabled;
  const [menuOpen, setMenuOpen] = useState(false);
  // Opened by key: focus returns to the card, and the native contextmenu that follows is swallowed.
  const [byKey, setByKey] = useState(false);
  const keyOpened = useRef(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const est = count(props.estimate);
  const done = count(props.done);
  const hasEstimate = props.estimate != null;
  const kind = props.type === "shallow" ? "Shallow" : "Deep";
  const tags = [...new Set(props.tags ?? [])].slice(0, MAX_TAGS);
  const tight = useTightHeight() && !row;
  // In card density "Selected" is a word on the chip line, like "Moving", so no state adds a line.
  const selectedShown = Boolean(selected) && !props.moving;
  const stateWords = [active ? "In progress" : "", row && selectedShown ? "Selected" : ""]
    .filter(Boolean)
    .join(" · ");
  const estimateText = hasEstimate ? `Est ${est}` : "No estimate";
  const meta = `${estimateText} · Done ${done}${props.tracked ? ` · ${props.tracked}` : ""}`;
  const className = cn(
    "@container w-full max-w-full rounded-md border border-line-strong bg-surface-raised text-start text-ink wrap-anywhere",
    !props.moving && "shadow-raised",
    row
      ? "flex min-h-hit-min flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
      : ["flex flex-col p-4", tight ? "gap-2" : "gap-3"],
    interactive &&
      "cursor-pointer outline-focus-ring outline-offset-2 transition-colors duration-quick ease-calm focus-visible:outline-2 enabled:active:bg-selection disabled:cursor-default disabled:border-dashed motion-reduce:transition-none",
    props.menu && !props.disabled && "pe-hit-min",
    selected && !props.moving ? "bg-selection" : interactive && "enabled:hover:bg-surface-sunken",
    active && "border-s-4 border-s-focus",
    props.moving && "border-dashed",
  );
  // Inline in an existing line, so starting a drag never makes the card taller.
  const movingWord = props.moving ? (
    <span
      data-slot="task-card-moving"
      className="flex-none whitespace-nowrap text-body-sm text-focus"
    >
      Moving
    </span>
  ) : null;
  const frogWord = props.frog ? (
    <span
      data-slot="task-card-frog"
      className="flex-none whitespace-nowrap text-break text-label uppercase"
    >
      Frog
    </span>
  ) : null;
  // Below layout-tight-height the dots, due date and tags share one muted line that truncates.
  const foldText = [props.due ?? "", ...tags].filter(Boolean).join(" · ");
  const foldDots = Math.max(est, done) > 0;
  const foldLine =
    tight && (foldText || foldDots) ? (
      <span
        data-slot="task-card-fold"
        className="flex min-w-0 items-center gap-2 overflow-hidden text-body-sm text-ink-muted"
      >
        {foldDots ? <Dots est={est} done={done} hasEstimate={hasEstimate} nowrap /> : null}
        <span className="min-w-0 truncate">{foldText}</span>
      </span>
    ) : null;
  const body = row ? (
    <>
      <ModeChip mode={props.type === "shallow" ? "shallow" : "focus"}>{kind}</ModeChip>
      <span
        data-slot="task-card-title"
        className="min-w-hit-min flex-1 truncate text-body font-semibold"
      >
        {title}
      </span>
      {frogWord}
      {movingWord}
      {stateWords ? (
        <span
          data-slot="task-card-state"
          className="flex-none whitespace-nowrap text-body-sm text-focus"
        >
          {stateWords}
        </span>
      ) : null}
      <span
        data-slot="task-card-meta"
        className="flex-none whitespace-nowrap font-mono text-timer-sm text-ink-muted tabular-nums"
      >
        {estimateText}
      </span>
    </>
  ) : (
    <>
      <span
        data-slot="task-card-top"
        className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden"
      >
        <span className="flex flex-none whitespace-nowrap">
          <ModeChip mode={props.type === "shallow" ? "shallow" : "focus"}>{kind}</ModeChip>
        </span>
        {frogWord}
        {movingWord}
        {selectedShown ? (
          <span
            data-slot="task-card-selected"
            className="flex-none whitespace-nowrap text-body-sm text-focus"
          >
            Selected
          </span>
        ) : null}
        {props.priority ? (
          <span
            data-slot="task-card-priority"
            className="min-w-0 truncate text-label uppercase text-ink-muted"
          >
            {PRIORITY[props.priority]}
          </span>
        ) : null}
      </span>
      <span
        data-slot="task-card-title"
        aria-hidden={interactive ? undefined : "true"}
        className="line-clamp-3 text-body font-semibold"
      >
        {title}
      </span>
      {interactive ? null : <span className="sr-only">{title}</span>}
      {stateWords ? (
        <span data-slot="task-card-state" className="text-body-sm text-focus">
          {stateWords}
        </span>
      ) : null}
      {tight ? null : Math.max(est, done) > 0 ? (
        <Dots est={est} done={done} hasEstimate={hasEstimate} />
      ) : null}
      <span
        data-slot="task-card-meta"
        className="font-mono text-body-sm text-ink-muted tabular-nums"
      >
        {meta}
      </span>
      {foldLine}
      {(props.due && !tight) || props.checklist ? (
        <span
          data-slot="task-card-plan"
          className="flex flex-wrap gap-x-3 text-body-sm text-ink-muted"
        >
          {props.due && !tight ? <span data-slot="task-card-due">{props.due}</span> : null}
          {props.checklist ? (
            <span data-slot="task-card-checklist" className="font-mono tabular-nums">
              {`${count(props.checklist.done)} of ${count(props.checklist.total)}`}
            </span>
          ) : null}
        </span>
      ) : null}
      {tags.length && !tight ? (
        <span data-slot="task-card-tags" className="flex flex-wrap gap-1-5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-pill border border-line-strong px-2 text-caption text-ink-muted"
            >
              {t}
            </span>
          ))}
        </span>
      ) : null}
      {props.project ? (
        <span data-slot="task-card-project" className="text-body-sm text-ink-muted">
          {props.project}
        </span>
      ) : null}
    </>
  );
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // With both, Return opens (the click that Return would make is what selects).
    if (event.key === "Enter" && onSelect && onOpen) {
      event.preventDefault();
      onOpen();
    }
    const menuKey =
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey);
    if (hasMenu && menuKey) {
      event.preventDefault();
      keyOpened.current = true;
      if (!menuOpen) {
        setByKey(true);
        setMenuOpen(true);
      }
    }
    props.onKeyDown?.(event);
  };
  const card = interactive ? (
    <button
      ref={cardRef}
      type="button"
      data-slot="task-card"
      data-density={row ? "row" : "card"}
      onClick={onSelect ?? onOpen}
      onDoubleClick={onSelect ? onOpen : undefined}
      onKeyDown={onKeyDown}
      disabled={props.disabled}
      aria-label={accessibleName(props, tags)}
      className={className}
    >
      {body}
    </button>
  ) : (
    <article data-slot="task-card" data-density={row ? "row" : "card"} className={className}>
      {body}
    </article>
  );
  if (!props.menu || !hasMenu) return card;
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: only marks a keyboard-opened menu's native contextmenu as handled; not a control
    <div
      data-slot="task-card-frame"
      className="relative"
      onContextMenu={(event) => {
        // The key-opened menu has focus on an item, a sibling of the card, so listen on the frame.
        if (!keyOpened.current) return;
        keyOpened.current = false;
        event.preventDefault();
      }}
    >
      {card}
      <span
        className={cn("absolute end-0 flex", row ? "inset-y-0 items-center" : "top-1 items-start")}
      >
        <CardMenu
          title={title}
          menu={props.menu}
          frog={props.frog}
          tabIndex={props.menuTabIndex ?? 0}
          open={menuOpen}
          setOpen={(open) => {
            setMenuOpen(open);
            if (!open) {
              setByKey(false);
              keyOpened.current = false;
            }
          }}
          returnFocus={byKey ? cardRef : undefined}
          onToggle={() => {
            keyOpened.current = false;
            setByKey(false);
            setMenuOpen(!menuOpen);
          }}
        />
      </span>
    </div>
  );
}
