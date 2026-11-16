import type { ReactElement, ReactNode } from "react";
import type { BarRowProps } from "../../types";

// A share of the scale, 0 to 100. A bad scale reads as empty, never as a wide bar.
function share(minutes: number, scale: number): number {
  if (!(scale > 0) || !(minutes > 0)) return 0;
  return Math.min(100, (minutes / scale) * 100);
}

/**
 * The list that owns the three shared columns: label and duration content-sized, the bar takes the rest.
 * App code never writes the column template.
 */
export function BarList(props: { children: ReactNode; "aria-label"?: string }): ReactElement {
  return (
    <ul
      data-slot="bar-list"
      aria-label={props["aria-label"]}
      style={{ gridTemplateColumns: "auto minmax(0, 1fr) auto" }}
      className="m-0 grid list-none p-0"
    >
      {props.children}
    </ul>
  );
}

/**
 * A duration as a bar, one list item. Three subgrid columns: label, bar, duration.
 * Put rows in a BarList, which supplies the three columns. Read as `spoken`; never focused.
 */
export function BarRow(props: BarRowProps): ReactElement {
  const { goal } = props;
  const width = `${share(props.minutes, goal ? goal.minutes : props.max)}%`;
  return (
    <li
      data-slot="bar-row"
      aria-label={props.spoken}
      className="col-span-3 grid min-h-control-sm grid-cols-subgrid items-center gap-x-3 text-body text-ink"
    >
      <span aria-hidden="true" data-slot="bar-label">
        {props.label}
      </span>
      <span aria-hidden="true" className="flex min-w-0 items-center gap-2">
        {goal ? (
          <span
            data-slot="bar-track"
            className="relative flex h-bar-height min-w-0 flex-1 items-center"
          >
            <span data-slot="bar-track-line" className="h-0 w-full border-t border-line" />
            <span
              data-slot="bar-fill"
              style={{ width }}
              className="absolute inset-y-0 start-0 rounded-pill bg-focus"
            />
            <span
              data-slot="bar-goal-stub"
              className="absolute end-0 bottom-full h-1-5 border-s-2 border-ink"
            />
            <span
              data-slot="bar-goal-stub"
              className="absolute end-0 top-full h-1-5 border-s-2 border-ink"
            />
          </span>
        ) : (
          <span className="min-w-0 flex-1">
            <span
              data-slot="bar-fill"
              style={{ width }}
              className="block h-bar-height rounded-pill bg-line-strong"
            />
          </span>
        )}
        {goal ? (
          <span className="whitespace-nowrap text-body-sm text-ink-muted">{goal.words}</span>
        ) : null}
      </span>
      <span aria-hidden="true" className="whitespace-nowrap text-end text-timer-sm">
        {props.duration}
      </span>
    </li>
  );
}
