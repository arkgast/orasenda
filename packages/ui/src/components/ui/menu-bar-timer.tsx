import type { ReactElement } from "react";
import { cn } from "../../lib/utils";

type TimerMode = "focus" | "break" | "routine" | "warning" | "paused" | "idle";

export interface MenuBarTimerProps {
  remaining?: string;
  remainingLabel?: string;
  progress?: number;
  mode?: TimerMode;
  task?: string;
  compact?: boolean;
}

const MODE_WORD: Record<TimerMode, string> = {
  focus: "Focus",
  break: "Break",
  routine: "Routine",
  warning: "Almost up",
  paused: "Paused",
  idle: "No session",
};

function Shape({ mode }: { mode: TimerMode }): ReactElement {
  return (
    <svg
      data-slot="menu-bar-timer-shape-svg"
      className="size-icon-md shrink-0 fill-current"
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      {mode === "break" ? (
        <path d="M5 0a5 5 0 0 1 0 10z" />
      ) : mode === "routine" ? (
        <rect x={0.5} y={0.5} width={9} height={9} rx={2.5} />
      ) : mode === "warning" ? (
        <path d="M5 0.5 9.6 9.5H0.4z" />
      ) : mode === "paused" ? (
        <path d="M1 1h3v8H1zM6 1h3v8H6z" />
      ) : (
        <circle cx={5} cy={5} r={4} fill="none" stroke="currentColor" strokeWidth={1.5} />
      )}
    </svg>
  );
}

const RING_LENGTH = 2 * Math.PI * 5;

function clamp(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/**
 * Time that is always visible: the mode as a shape, the digits the host sends, and (floating only)
 * the task. The digits come from Rust and are never computed here (ADR-011).
 */
export function MenuBarTimer({
  remaining,
  remainingLabel,
  progress,
  mode = "focus",
  task,
  compact = true,
}: MenuBarTimerProps): ReactElement {
  const floating = compact === false;
  const label =
    mode === "idle"
      ? MODE_WORD.idle
      : `${MODE_WORD[mode] ?? mode}, ${remainingLabel || remaining || "25:00"} remaining${task ? `, ${task}` : ""}`;
  return (
    <span
      data-slot="menu-bar-timer"
      data-mode={mode}
      data-compact={compact ? "true" : "false"}
      role="timer"
      aria-live="off"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm bg-surface-raised px-2 font-medium font-mono text-timer-sm text-ink tabular-nums min-h-hit-floor",
        floating && "gap-2 border border-line-strong p-2 text-timer-md shadow-raised",
      )}
    >
      {mode === "focus" ? (
        <svg
          data-slot="menu-bar-timer-ring"
          className="-rotate-90 size-icon-md shrink-0"
          viewBox="0 0 14 14"
          aria-hidden="true"
          focusable="false"
        >
          <circle className="fill-none stroke-line-strong" strokeWidth={1} cx={7} cy={7} r={5} />
          <circle
            data-slot="menu-bar-timer-progress"
            className="fill-none stroke-focus transition-all duration-calm ease-calm motion-reduce:transition-none"
            strokeWidth={2}
            strokeLinecap="round"
            cx={7}
            cy={7}
            r={5}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * clamp(progress)}
          />
        </svg>
      ) : (
        <span
          data-slot="menu-bar-timer-shape"
          className={cn(
            "inline-flex shrink-0 items-center justify-center",
            mode === "warning" && "text-amber",
            mode === "break" && "text-break",
            mode === "routine" && "text-routine",
          )}
        >
          <Shape mode={mode} />
        </span>
      )}
      {mode !== "idle" ? (
        <span data-slot="menu-bar-timer-digits" aria-hidden="true">
          {remaining || "25:00"}
        </span>
      ) : null}
      {floating && task ? (
        <span
          data-slot="menu-bar-timer-task"
          aria-hidden="true"
          className="truncate font-normal font-sans text-body-sm text-ink-muted"
        >
          {task}
        </span>
      ) : null}
    </span>
  );
}
