import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

export interface SettingsNavItem {
  id: string;
  name: string;
}

export interface SettingsNavProps {
  items: SettingsNavItem[];
  current: string;
  /** `via` is "keyboard" when Return or Space activated the item, otherwise "pointer". */
  onSelect: (id: string, via: "pointer" | "keyboard") => void;
  orientation: "vertical" | "horizontal";
}

/** The Settings pane list: a vertical side list, or a horizontal tab strip at compact width. */
export function SettingsNav({
  items,
  current,
  onSelect,
  orientation,
}: SettingsNavProps): ReactElement {
  const horizontal = orientation === "horizontal";
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const strip = useRef<HTMLUListElement>(null);
  const [roving, setRoving] = useState<{ id: string; under: string } | null>(null);
  const [overflow, setOverflow] = useState({ before: false, after: false });
  const has = (id: string | null) => items.some((i) => i.id === id);
  const stop =
    roving && roving.under === current && has(roving.id)
      ? roving.id
      : has(current)
        ? current
        : (items[0]?.id ?? null);

  // Re-observe the tabs when the set of items changes (their ids, not the array's identity).
  const itemIds = items.map((i) => i.id).join("\u0000");
  // biome-ignore lint/correctness/useExhaustiveDependencies: itemIds stands for the items' ids
  useEffect(() => {
    const el = strip.current;
    if (!horizontal || !el) return;
    const measure = () => {
      const before = el.scrollLeft > 1;
      const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setOverflow((o) => (o.before === before && o.after === after ? o : { before, after }));
    };
    measure();
    el.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    for (const child of Array.from(el.children)) observer?.observe(child);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [horizontal, itemIds]);

  function focusAt(index: number) {
    const item = items[(index + items.length) % items.length];
    if (!item) return;
    setRoving({ id: item.id, under: current });
    const button = refs.current[items.indexOf(item)];
    button?.focus();
    button?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const [prev, next] = horizontal ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    const target =
      event.key === next
        ? index + 1
        : event.key === prev
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    focusAt(target);
  }

  const scroll = (direction: 1 | -1) => {
    const el = strip.current;
    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollBy({
      left: direction * el.clientWidth * 0.75,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const list = items.map((item, index) => {
    const isCurrent = item.id === current;
    return (
      <li key={item.id} className={horizontal ? "shrink-0" : undefined}>
        <button
          type="button"
          data-slot="settings-nav-item"
          ref={(n) => {
            refs.current[index] = n;
          }}
          tabIndex={item.id === stop ? 0 : -1}
          aria-current={isCurrent ? "page" : undefined}
          onFocus={() => setRoving({ id: item.id, under: current })}
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={(event) => {
            const via = event.detail === 0 ? "keyboard" : "pointer";
            // WKWebView does not focus a clicked button; keep focus on the item.
            if (via === "pointer") event.currentTarget.focus({ preventScroll: true });
            onSelect(item.id, via);
          }}
          className={cn(
            "min-h-hit-min cursor-pointer bg-clear px-3 py-1 text-body text-ink outline-focus-ring outline-offset-2 focus-visible:outline-2 motion-reduce:transition-none",
            horizontal
              ? "shrink-0 whitespace-nowrap border-0 border-b-3 border-b-clear text-center hover:bg-surface-sunken aria-[current=page]:border-b-focus aria-[current=page]:font-semibold"
              : "w-full rounded-sm border-0 border-s-3 border-s-clear text-start hover:bg-surface-sunken aria-[current=page]:border-s-focus aria-[current=page]:bg-selection aria-[current=page]:font-semibold",
          )}
        >
          {item.name}
        </button>
      </li>
    );
  });

  if (!horizontal) {
    return (
      <nav
        data-slot="settings-nav"
        data-orientation="vertical"
        aria-label="Settings"
        className="min-h-0 w-index-width overflow-y-auto p-1"
      >
        <ul className="m-0 flex w-full list-none flex-none flex-col gap-1 p-0">{list}</ul>
      </nav>
    );
  }
  return (
    <nav
      data-slot="settings-nav"
      data-orientation="horizontal"
      aria-label="Settings"
      className="flex items-center gap-1"
    >
      <span
        className={cn("inline-flex", !overflow.before && "invisible")}
        aria-hidden={!overflow.before || undefined}
      >
        <IconButton
          label="Earlier panes"
          tabIndex={-1}
          disabled={!overflow.before}
          onClick={() => scroll(-1)}
          icon={
            <span className="inline-flex rotate-90">
              <Icon name="chevron" />
            </span>
          }
        />
      </span>
      <ul
        ref={strip}
        data-slot="settings-nav-strip"
        className="m-0 flex min-w-0 flex-1 list-none gap-1 overflow-x-auto border-0 border-b border-b-line p-1 scroll-px-1"
      >
        {list}
      </ul>
      <span
        className={cn("inline-flex", !overflow.after && "invisible")}
        aria-hidden={!overflow.after || undefined}
      >
        <IconButton
          label="More panes"
          tabIndex={-1}
          disabled={!overflow.after}
          onClick={() => scroll(1)}
          icon={
            <span className="inline-flex -rotate-90">
              <Icon name="chevron" />
            </span>
          }
        />
      </span>
    </nav>
  );
}
