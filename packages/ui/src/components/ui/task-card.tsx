import { type KeyboardEvent, type ReactElement, useRef, useState } from "react";
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
  ];
  return parts.filter(Boolean).join(", ");
}

function Dots({ est, done, hasEstimate }: { est: number; done: number; hasEstimate: boolean }) {
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
    <span aria-hidden="true" data-slot="task-card-dots" className="inline-flex flex-wrap gap-1-5">
      {dots}
    </span>
  );
}

/** The ⋯ button and its menu. A sibling of the card, never inside its button. */
function CardMenu({ title, menu, frog }: { title: string; menu: TaskCardMenu; frog?: boolean }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
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
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open ? (
        <PopoverMenu
          heading={title}
          items={items}
          anchor={anchor}
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
  const est = count(props.estimate);
  const done = count(props.done);
  const hasEstimate = props.estimate != null;
  const kind = props.type === "shallow" ? "Shallow" : "Deep";
  const tags = (props.tags ?? []).slice(0, MAX_TAGS);
  const stateWords = [active ? "In progress" : "", selected ? "Selected" : ""]
    .filter(Boolean)
    .join(" · ");
  const estimateText = hasEstimate ? `Est ${est}` : "No estimate";
  const meta = `${estimateText} · Done ${done}${props.tracked ? ` · ${props.tracked}` : ""}`;
  const className = cn(
    "@container w-full max-w-full rounded-md border border-line-strong bg-surface-raised text-start text-ink shadow-raised wrap-anywhere",
    row ? "flex min-h-hit-min items-center gap-3 px-3 py-2" : "flex flex-col gap-3 p-4",
    interactive &&
      "cursor-pointer outline-focus-ring outline-offset-2 transition-colors duration-quick ease-calm focus-visible:outline-2 enabled:hover:bg-surface-sunken enabled:active:bg-selection disabled:cursor-default disabled:border-dashed motion-reduce:transition-none",
    props.menu && "pe-hit-min",
    selected && "bg-selection",
    active && "border-s-4 border-s-focus",
  );
  const frogWord = props.frog ? (
    <span data-slot="task-card-frog" className="text-break text-label uppercase">
      Frog
    </span>
  ) : null;
  const body = row ? (
    <>
      <ModeChip mode={props.type === "shallow" ? "shallow" : "focus"}>{kind}</ModeChip>
      <span data-slot="task-card-title" className="min-w-0 flex-1 truncate text-body font-semibold">
        {title}
      </span>
      {frogWord}
      {stateWords ? (
        <span data-slot="task-card-state" className="flex-none text-body-sm text-focus">
          {stateWords}
        </span>
      ) : null}
      <span
        data-slot="task-card-meta"
        className="flex-none font-mono text-timer-sm text-ink-muted tabular-nums"
      >
        {estimateText}
      </span>
    </>
  ) : (
    <>
      <span data-slot="task-card-top" className="flex flex-wrap items-center gap-2">
        <ModeChip mode={props.type === "shallow" ? "shallow" : "focus"}>{kind}</ModeChip>
        {frogWord}
        {props.priority ? (
          <span data-slot="task-card-priority" className="text-label uppercase text-ink-muted">
            {PRIORITY[props.priority]}
          </span>
        ) : null}
      </span>
      <span data-slot="task-card-title" className="text-body font-semibold">
        {title}
      </span>
      {stateWords ? (
        <span data-slot="task-card-state" className="text-body-sm text-focus">
          {stateWords}
        </span>
      ) : null}
      <Dots est={est} done={done} hasEstimate={hasEstimate} />
      <span
        data-slot="task-card-meta"
        className="font-mono text-body-sm text-ink-muted tabular-nums"
      >
        {meta}
      </span>
      {props.due || props.checklist ? (
        <span
          data-slot="task-card-plan"
          className="flex flex-wrap gap-x-3 text-body-sm text-ink-muted"
        >
          {props.due ? <span data-slot="task-card-due">{props.due}</span> : null}
          {props.checklist ? (
            <span data-slot="task-card-checklist" className="font-mono tabular-nums">
              {`${count(props.checklist.done)} of ${count(props.checklist.total)}`}
            </span>
          ) : null}
        </span>
      ) : null}
      {tags.length ? (
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
    props.onKeyDown?.(event);
  };
  const card = interactive ? (
    <button
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
  if (!props.menu) return card;
  return (
    <div data-slot="task-card-frame" className="relative">
      {card}
      <span
        className={cn("absolute end-1 flex", row ? "inset-y-0 items-center" : "top-1 items-start")}
      >
        <CardMenu title={title} menu={props.menu} frog={props.frog} />
      </span>
    </div>
  );
}
