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
      className="m-0 flex min-w-0 flex-col gap-1"
    >
      {/* biome-ignore lint/a11y/noRedundantRoles: list-style none drops the list role in WebKit */}
      <ul role="list" className="sr-only">
        {bars.map((b) => (
          <li key={`${b.label}-${b.spoken}`}>{b.spoken}</li>
        ))}
      </ul>
      {goal && goalMinutes > 0 ? (
        <p data-slot="trend-bars-goal-spoken" className="sr-only m-0">
          {goal.words}
        </p>
      ) : null}
      <div
        data-slot="trend-bars-plot"
        aria-hidden="true"
        className="flex min-w-0 items-start justify-start gap-5"
      >
        {bars.map((b) => (
          <div
            key={`${b.label}-${b.spoken}`}
            data-slot="trend-bar"
            data-current={b.current ? "" : undefined}
            data-empty={b.empty ? "" : undefined}
            className="flex min-w-0 max-w-chart-column-width basis-chart-column-width flex-col items-center gap-1"
          >
            <div className="relative h-chart-height w-full">
              <span
                data-slot="trend-bar-scale"
                className="absolute inset-x-0 bottom-0 top-2 flex items-end justify-center"
              >
                {drawn(b) ? (
                  <span
                    data-slot="trend-bar-fill"
                    className="min-h-1 w-bar-height shrink-0 rounded-pill bg-line-strong forced-colors:border"
                    style={{ height: percent(b.minutes, top) }}
                  />
                ) : null}
                {goalMinutes > 0 && !b.empty ? (
                  <span
                    data-slot="trend-bar-goal-line"
                    className="absolute left-1/2 flex -translate-x-1/2 translate-y-1/2 gap-1"
                    style={{ bottom: percent(goalMinutes, top) }}
                  >
                    <span
                      data-slot="trend-bar-stub"
                      className="w-1-5 shrink-0 border-t-2 border-ink"
                    />
                    <span className="w-bar-height shrink-0" />
                    <span
                      data-slot="trend-bar-stub"
                      className="w-1-5 shrink-0 border-t-2 border-ink"
                    />
                  </span>
                ) : null}
              </span>
            </div>
            <span
              className={cn(
                "max-w-full text-center text-caption text-ink-muted break-normal",
                b.current && "font-semibold text-ink",
              )}
            >
              {b.label}
            </span>
          </div>
        ))}
        {goal && goalMinutes > 0 ? (
          <div
            data-slot="trend-bars-goal-slot"
            className="flex h-chart-height shrink-0 flex-col justify-end pt-2"
          >
            <span
              data-slot="trend-bars-goal"
              className="relative translate-y-1/2 whitespace-nowrap text-caption text-ink"
              style={{ bottom: percent(goalMinutes, top) }}
            >
              {goal.words}
            </span>
          </div>
        ) : null}
      </div>
      <figcaption id={captionId} className="text-caption text-ink-muted">
        {caption}
      </figcaption>
    </figure>
  );
}
