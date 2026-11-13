import type { ReactElement } from "react";
import { cn } from "../../lib/utils";
import { ModeChip } from "./mode-chip";

type StripMode = "focus" | "break" | "routine" | "warning" | "paused" | "idle";

export interface TimerStripProps {
  remaining?: string;
  remainingLabel?: string;
  /** The elapsed fraction [0, 1]; the bar shows what is left. */
  progress?: number;
  mode?: StripMode;
  /** Shown when idle ("25 min"), never fake digits. */
  idleLength?: string;
  /** The narrow form (stackedStrip). */
  stacked?: boolean;
}

const WORD: Record<StripMode, string> = {
  focus: "Focus",
  break: "Break",
  routine: "Routine",
  warning: "Almost up",
  paused: "Paused",
  idle: "No session",
};

const FILL: Record<StripMode, string> = {
  focus: "bg-focus",
  break: "bg-break",
  routine: "bg-routine",
  warning: "bg-amber",
  paused: "bg-ink-muted",
  idle: "bg-ink-muted",
};

// Fluid digits from tokens: never below timer-md, never above timer-lg (as TimerRing's fluid digits).
const FLUID_WIDE = "clamp(var(--type-timer-md-font-size), 14cqi, var(--type-timer-lg-font-size))";
const FLUID_STACKED =
  "clamp(var(--type-timer-md-font-size), 10cqi, var(--type-timer-lg-font-size))";

function clamp(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function label(p: TimerStripProps, mode: StripMode): string {
  const parts =
    mode === "idle"
      ? ["No session", p.idleLength]
      : [`${WORD[mode]}, ${p.remainingLabel || p.remaining || "25:00"} remaining`];
  return parts.filter(Boolean).join(", ");
}

/**
 * The time when the window is a strip: the state chip and digits over a horizon bar. The fill shows
 * time left and its end reads by thickness, not colour; warning adds a triangle at the end. Not a
 * control and no live region.
 */
export function TimerStrip(props: TimerStripProps): ReactElement {
  const { remaining, idleLength, stacked = false } = props;
  const mode = props.mode ?? "focus";
  const left = `${(1 - clamp(props.progress)) * 100}%`;
  return (
    <div
      data-slot="timer-strip"
      data-mode={mode}
      data-stacked={stacked ? "true" : undefined}
      role="timer"
      aria-live="off"
      aria-label={label(props, mode)}
      className={cn(
        "@container flex w-full min-w-0 flex-col gap-2",
        stacked && "items-center gap-1 text-center",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "flex min-w-0 items-center gap-3",
          stacked && "justify-center gap-2",
          mode === "warning" && "*:data-[slot=mode-chip]:duration-slow",
          "*:data-[slot=mode-chip]:shrink-0 *:data-[slot=mode-chip]:motion-reduce:transition-none",
        )}
      >
        <ModeChip mode={mode} />
        {mode === "idle" ? (
          idleLength ? (
            <span
              data-slot="timer-strip-length"
              className="whitespace-nowrap font-mono text-timer-md text-ink-muted tabular-nums"
            >
              {idleLength}
            </span>
          ) : null
        ) : (
          <span
            data-slot="timer-strip-digits"
            className={cn(
              "whitespace-nowrap font-light font-mono text-timer-md tabular-nums",
              mode === "paused" ? "text-ink-muted" : "text-ink",
            )}
            style={{ fontSize: stacked ? FLUID_STACKED : FLUID_WIDE }}
          >
            {remaining || "25:00"}
          </span>
        )}
      </div>
      {mode !== "idle" ? (
        <div
          data-slot="timer-strip-bar"
          aria-hidden="true"
          className="relative h-icon-sm w-full flex-none"
        >
          <span
            data-slot="timer-strip-track"
            className="absolute inset-x-0 top-2/5 h-1/5 rounded-pill bg-line-strong forced-colors:forced-color-adjust-none forced-colors:bg-current"
          />
          <span
            data-slot="timer-strip-fill"
            className="absolute inset-s-0 top-1/5 h-3/5 transition-all duration-calm ease-calm motion-reduce:transition-none"
            style={{ width: left }}
          >
            <span
              data-slot="timer-strip-fill-color"
              className={cn(
                "block size-full rounded-pill transition-colors duration-slow ease-calm motion-reduce:transition-none forced-colors:forced-color-adjust-none forced-colors:bg-current",
                FILL[mode],
              )}
            />
          </span>
          {mode === "warning" ? (
            <svg
              data-slot="timer-strip-triangle"
              className="absolute top-0 size-icon-sm -translate-x-1/2 fill-current text-amber rtl:translate-x-1/2"
              style={{ insetInlineStart: left }}
              viewBox="0 0 10 10"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M5 0.5 9.6 9.5H0.4z" />
            </svg>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
