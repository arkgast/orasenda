import type { ReactElement } from "react";

export interface NowLineProps {
  time: string;
}

/** The current-time rule on the day calendar: the word "Now", the clock time and a 1px focus line with a dot. */
export function NowLine(props: NowLineProps): ReactElement {
  return (
    <div
      data-slot="now-line"
      role="img"
      aria-label={`Now, ${props.time}`}
      className="flex items-center gap-2 font-medium text-focus text-timer-sm"
    >
      <span data-slot="now-line-time" className="font-mono tabular-nums">
        {`Now · ${props.time}`}
      </span>
      <span data-slot="now-line-rule" aria-hidden="true" className="relative h-px flex-1 bg-focus">
        <span className="absolute start-0 top-1/2 size-1-5 -translate-y-1/2 rounded-pill bg-focus" />
      </span>
    </div>
  );
}
