import type { CSSProperties, ReactElement } from "react";
import { cn } from "../../lib/utils";
import { ModeChip } from "./mode-chip";

type Mode = NonNullable<TimerRingProps["mode"]>;

export interface TimerRingProps {
  remaining?: string;
  remainingLabel?: string;
  /** The elapsed fraction [0,1]; the arc shows what is left. */
  progress?: number;
  mode?: "focus" | "break" | "routine" | "warning" | "paused" | "idle";
  /** Clamped to two lines, whole in the accessible name. */
  task?: string;
  /**
   * A number renders that diameter in px, as before. "fluid" fills the host's slot: the diameter is
   * the slot's shorter side clamped to [timer-min-size, timer-full-size] (container query), digits
   * never below timer-md.
   */
  size?: number | "fluid";
  /** px for a numeric size; with "fluid", units of the 400-unit drawing (default 10), so it scales with the diameter. */
  stroke?: number;
  clock?: string;
}

const WORD: Record<Mode, string> = {
  focus: "Focus",
  break: "Break",
  routine: "Routine",
  warning: "Almost up",
  paused: "Paused",
  idle: "No session",
};

const ARC: Record<Mode, string> = {
  focus: "stroke-focus",
  break: "stroke-break",
  routine: "stroke-routine",
  warning: "stroke-amber",
  paused: "stroke-ink-muted",
  idle: "stroke-clear",
};

const CALM = "var(--duration-calm) var(--easing-calm)";
const ARC_TRANSITION = `stroke-dashoffset ${CALM}, stroke ${CALM}`;
// At two minutes the arc colour fades into amber over duration-slow; the offset keeps duration-calm.
const WARNING_TRANSITION = `stroke-dashoffset ${CALM}, stroke var(--duration-slow) var(--easing-calm)`;

// The digits scale with the ring (cqi is a unit of the ring's own box): timer-md up to timer-xl.
const DIGITS = {
  fluid: "clamp(var(--type-timer-md-font-size), 23cqi, var(--type-timer-xl-font-size))",
  full: "min(var(--type-timer-xl-font-size), 30cqi)",
  default: "min(var(--type-timer-lg-font-size), 23cqi)",
} as const;

// The ring takes the slot's shorter side, between timer-min-size and timer-full-size.
const FLUID_WIDTH = "clamp(var(--timer-min-size), min(100cqi, 100cqb), var(--timer-full-size))";

function clamp(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function label(p: TimerRingProps, mode: Mode): string {
  if (mode === "idle") return WORD.idle;
  const spoken = p.remainingLabel || p.remaining || "25:00";
  return `${WORD[mode]}, ${spoken} remaining${p.task ? `, ${p.task}` : ""}${p.clock ? `, Wall clock, ${p.clock}` : ""}`;
}

/** The countdown ring. The arc shows what is left: full at the start, empty at the end. */
export function TimerRing(p: TimerRingProps): ReactElement {
  const fluid = p.size === "fluid";
  const mode = p.mode ?? "focus";
  const size = typeof p.size === "number" ? Math.max(160, p.size || 280) : fluid ? 400 : 280;
  const stroke = Math.max(2, Math.min(size / 4, p.stroke || Math.round(size / 40)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = clamp(p.progress);
  const full = !fluid && size >= 480;

  const ringStyle: CSSProperties = { width: fluid ? FLUID_WIDTH : size };
  const ring = (
    <div
      data-slot="timer-ring"
      data-mode={mode}
      role="timer"
      aria-live="off"
      aria-label={label(p, mode)}
      style={ringStyle}
      className="@container relative inline-grid max-w-full flex-none place-items-center"
    >
      <svg
        className="block h-auto w-full -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          data-slot="timer-ring-track"
          className="fill-none stroke-line-strong"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={Math.max(2, stroke / 3)}
        />
        {mode !== "idle" ? (
          <circle
            data-slot="timer-ring-arc"
            className={cn("fill-none", ARC[mode])}
            style={{ transition: mode === "warning" ? WARNING_TRANSITION : ARC_TRANSITION }}
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * progress}
          />
        ) : null}
      </svg>
      <div
        data-slot="timer-ring-center"
        aria-hidden="true"
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-2 text-center",
          mode === "warning" && "[&_[data-slot=mode-chip]]:duration-slow",
        )}
      >
        <ModeChip mode={mode} />
        {mode !== "idle" ? (
          <div
            data-slot="timer-ring-digits"
            style={{ fontSize: DIGITS[fluid ? "fluid" : full ? "full" : "default"] }}
            className="font-light font-mono text-ink leading-none tabular-nums"
          >
            {p.remaining || "25:00"}
          </div>
        ) : null}
        {p.task ? (
          <div
            data-slot="timer-ring-task"
            className="line-clamp-2 max-w-3/5 overflow-hidden wrap-anywhere text-body-sm text-ink-muted"
          >
            {p.task}
          </div>
        ) : null}
        {p.clock ? (
          <div
            data-slot="timer-ring-clock"
            className={cn(
              "font-mono text-ink-muted text-timer-sm tabular-nums",
              full && "text-timer-md",
              fluid && "@lg:text-timer-md",
            )}
          >
            {`Clock · ${p.clock}`}
          </div>
        ) : null}
      </div>
      {p.clock ? <span className="sr-only">{`Wall clock, ${p.clock}`}</span> : null}
    </div>
  );
  return fluid ? (
    <div
      data-slot="timer-ring-box"
      className="@container-size grid aspect-square max-h-full min-h-timer-min-size w-full min-w-timer-min-size place-items-center"
    >
      {ring}
    </div>
  ) : (
    ring
  );
}
