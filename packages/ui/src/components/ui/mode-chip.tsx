import type { ReactElement, ReactNode } from "react";
import { ModeShape } from "./glyphs";

export interface ModeChipProps {
  mode?: "focus" | "break" | "routine" | "warning" | "shallow" | "paused" | "idle";
  children?: ReactNode;
}

const WORD = {
  focus: "Focus",
  break: "Break",
  routine: "Routine",
  warning: "Almost up",
  shallow: "Shallow",
  paused: "Paused",
  idle: "No session",
} as const;

// Joined with a plain template, not cn: text-label (a size) and text-<tint> (a
// colour) share the text- prefix, and cn would drop one until theme-aware twMerge lands.
const BASE =
  "inline-flex min-h-control-sm items-center gap-2 rounded-pill px-3 py-1 text-label uppercase transition-colors duration-calm ease-calm forced-colors:border";

const TINT = {
  focus: "bg-focus-soft text-focus",
  break: "bg-break-soft text-break",
  routine: "bg-routine-soft text-routine",
  warning: "bg-amber-soft text-amber",
  shallow: "bg-surface-raised text-ink-muted inset-ring inset-ring-line-strong",
  paused: "bg-surface-raised text-ink-muted inset-ring inset-ring-line-strong",
  idle: "bg-surface-raised text-ink-muted inset-ring inset-ring-line-strong",
} as const;

/** A shape and a word for a mode. A label, never a control. */
export function ModeChip({ mode = "focus", children }: ModeChipProps): ReactElement {
  return (
    <span data-slot="mode-chip" data-mode={mode} className={`${BASE} ${TINT[mode]}`}>
      <ModeShape mode={mode} />
      {children || WORD[mode]}
    </span>
  );
}
