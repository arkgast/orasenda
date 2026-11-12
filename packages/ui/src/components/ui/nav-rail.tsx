import { type KeyboardEvent, type ReactElement, useRef, useState } from "react";
import type { NavPage } from "../../types.ts";
import { Icon } from "./icon";

export interface NavRailProps {
  current: NavPage;
  onNavigate: (page: NavPage) => void;
}

const PAGES: ReadonlyArray<{ id: NavPage; label: string }> = [
  { id: "today", label: "Today" },
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
  { id: "routines", label: "Routines" },
  { id: "review", label: "Review" },
  { id: "settings", label: "Settings" },
];

/** The slim left rail. The current page has aria-current, a selection ground and a focus side bar. One tab stop, on the current page; arrows move, Return or Space navigates. */
export function NavRail({ current, onNavigate }: NavRailProps): ReactElement {
  // The tab stop follows focus while it is inside the rail and returns to the current page after.
  const [focused, setFocused] = useState<NavPage | null>(null);
  const stop = focused ?? current;
  const rail = useRef<HTMLElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: KeyboardEvent, from: number): void => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    items.current[(from + step + PAGES.length) % PAGES.length]?.focus();
  };
  return (
    <nav
      ref={rail}
      data-slot="nav-rail"
      aria-label="Main navigation"
      className="z-rail flex w-rail-width flex-none flex-col gap-2 bg-surface-raised py-3"
    >
      {PAGES.map(({ id, label }, index) => {
        const isCurrent = current === id;
        return (
          <button
            key={id}
            ref={(el) => {
              items.current[index] = el;
            }}
            tabIndex={id === stop ? 0 : -1}
            onFocus={() => setFocused(id)}
            onBlur={(event) => {
              if (!rail.current?.contains(event.relatedTarget)) setFocused(null);
            }}
            onKeyDown={(event) => move(event, index)}
            data-slot="nav-rail-item"
            type="button"
            aria-current={isCurrent ? "page" : undefined}
            onClick={() => onNavigate(id)}
            className={`flex min-h-control-lg w-full cursor-pointer flex-col items-center justify-center gap-1 border-s-3 p-1 ${
              isCurrent
                ? "border-focus bg-selection text-focus"
                : "border-clear bg-clear text-ink-muted hover:bg-surface-sunken"
            }`}
          >
            <Icon name={id} />
            <span className={isCurrent ? "text-caption font-semibold" : "text-caption"}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
