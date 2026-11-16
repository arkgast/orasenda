import { type ReactElement, useId } from "react";
import { cn } from "../../lib/utils";

export interface TrendBar {
  /** Short column label: "Mon", "12 Oct", "Nov". For the current period, a word such as "Today". */
  label: string;
  /** The period in a sentence for VoiceOver, e.g. "Monday, 1 hour 5 minutes". */
  spoken: string;
  minutes: number;
  /** Not drawn: kept so a caller can pair the bar with its text. */
  duration: string;
  current: boolean;
  /** Nothing recorded, or a future period: only the label is drawn. */
  empty: boolean;
}
export interface TrendBarsGoal {
  minutes: number;
  /** The goal in words, shown once at the end of the plot: "Goal 12h". */
  words: string;
}
export interface TrendBarsProps {
  bars: TrendBar[];
  goal?: TrendBarsGoal;
  caption: string;
}

const percent = (minutes: number, top: number): string =>
  `${Math.min(100, (minutes / top) * 100)}%`;

/** The vertical form of BarRow's marks: a few periods side by side, scaled to the largest or the goal. */
export function TrendBars({ bars, goal, caption }: TrendBarsProps): ReactElement {
  const captionId = useId();
  const goalMinutes = goal && goal.minutes > 0 ? goal.minutes : 0;
  const peak = Math.max(0, ...bars.filter((b) => !b.empty).map((b) => b.minutes));
  const top = Math.max(peak, goalMinutes);
  const drawn = (b: TrendBar) => !b.empty && b.minutes > 0 && top > 0;
  return (
    <figure
      data-slot="trend-bars"
      aria-labelledby={captionId}
      className="m-0 flex min-w-0 flex-col gap-2"
    >
      <figcaption id={captionId} className="text-body-sm text-ink-muted">
        {caption}
      </figcaption>
      <ul className="sr-only">
        {bars.map((b) => (
          <li key={`${b.label}-${b.spoken}`}>{b.spoken}</li>
        ))}
      </ul>
      <div data-slot="trend-bars-plot" aria-hidden="true" className="flex min-w-0 gap-1">
        {bars.map((b) => (
          <div
            key={`${b.label}-${b.spoken}`}
            data-slot="trend-bar"
            data-current={b.current ? "" : undefined}
            data-empty={b.empty ? "" : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
          >
            <div className="relative flex h-chart-height w-full items-end justify-center">
              {drawn(b) ? (
                <span
                  data-slot="trend-bar-fill"
                  className="w-bar-height rounded-sm bg-line-strong forced-colors:border"
                  style={{ height: percent(b.minutes, top) }}
                />
              ) : null}
              {goalMinutes > 0 && !b.empty ? (
                <span
                  data-slot="trend-bar-goal-line"
                  className="absolute inset-x-0 flex justify-center gap-1"
                  style={{ bottom: percent(goalMinutes, top) }}
                >
                  <span data-slot="trend-bar-stub" className="w-icon-sm border-t-2 border-ink" />
                  <span className="w-bar-height" />
                  <span data-slot="trend-bar-stub" className="w-icon-sm border-t-2 border-ink" />
                </span>
              ) : null}
            </div>
            <span
              className={cn(
                "max-w-full text-center text-caption text-ink-muted break-words",
                b.current && "font-semibold text-ink",
              )}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>
      {goal && goalMinutes > 0 ? (
        <p data-slot="trend-bars-goal" className="m-0 self-end text-caption text-ink">
          {goal.words}
        </p>
      ) : null}
    </figure>
  );
}
