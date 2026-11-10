import type { ReactElement } from "react";
import { cn } from "../../lib/utils";

export type NavPage = "today" | "board" | "calendar" | "routines" | "review" | "settings";

export interface NavRailProps {
  current: NavPage;
  onNavigate: (page: NavPage) => void;
}

// Line icons on a 20 unit grid; replaced by Icon in T7.
const PAGES: ReadonlyArray<{ id: NavPage; label: string; path: string }> = [
  { id: "today", label: "Today", path: "M3 4h14v13H3zM3 8h14M7 2v4M13 2v4" },
  { id: "board", label: "Board", path: "M2 3h6v14H2zM12 3h6v14h-6z" },
  { id: "calendar", label: "Calendar", path: "M3 4h14v13H3zM3 8h14M7 11h2M12 11h2M7 14h2" },
  { id: "routines", label: "Routines", path: "M3 5l2 2 3-4M10 5h7M3 13l2 2 3-4M10 13h7" },
  { id: "review", label: "Review", path: "M3 17V9M9 17V3M15 17V6M2 18h16" },
  { id: "settings", label: "Settings", path: "M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M8 13v4" },
];

/** The slim left rail. The current page has aria-current, a selection ground and a focus side bar. */
export function NavRail({ current, onNavigate }: NavRailProps): ReactElement {
  return (
    <nav
      data-slot="nav-rail"
      aria-label="Main navigation"
      className="z-rail flex w-rail-width flex-none flex-col gap-2 bg-surface-raised py-3"
    >
      {PAGES.map(({ id, label, path }) => {
        const isCurrent = current === id;
        return (
          <button
            key={id}
            data-slot="nav-rail-item"
            type="button"
            aria-current={isCurrent ? "page" : undefined}
            onClick={() => onNavigate(id)}
            className={cn(
              "flex min-h-control-lg w-full cursor-pointer flex-col items-center justify-center gap-1 border-s-3 p-1 text-caption",
              isCurrent
                ? "border-focus bg-selection font-semibold text-focus"
                : "border-clear bg-clear text-ink-muted hover:bg-surface-sunken",
            )}
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-icon-lg"
            >
              <path d={path} />
            </svg>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
