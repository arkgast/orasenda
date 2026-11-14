import type { ReactElement } from "react";
import { cn } from "../../lib/utils";

export type HabitState = "done" | "skipped" | "rest" | "future";
export interface HabitDay {
  state: HabitState;
  today?: boolean;
  /** A localised date, e.g. Monday 9 November. */
  label?: string;
  /** 0 = Monday … 6 = Sunday. The first day's weekday sets the leading gap in the week layout. */
  weekday?: number;
}
export interface HabitDotsProps {
  name?: string;
  days: Array<HabitDay | HabitState>;
  note?: string;
  legend?: boolean;
  restartNote?: string;
  /** The run of days in words, e.g. "5 days kept". Shown under the grid. */
  runLine?: string;
  /** "week": rows of seven aligned to Monday under a weekday header. Unset: one wrapped line. */
  columns?: "week";
}

// Monday first. The key is the weekday's name, since two weekdays share a letter.
const WEEKDAY_LETTERS: Array<[string, string]> = [
  ["mon", "M"],
  ["tue", "T"],
  ["wed", "W"],
  ["thu", "T"],
  ["fri", "F"],
  ["sat", "S"],
  ["sun", "S"],
];

const WORDS: Record<HabitState, string> = {
  done: "Done",
  skipped: "Not done",
  rest: "Rest day",
  future: "Upcoming",
};

// The state is a shape: solid, hollow, dashed or dotted square. Never colour alone.
const SHAPES: Record<HabitState, string> = {
  done: "bg-break forced-colors:border",
  skipped: "border-2 border-line-strong",
  rest: "border-2 border-dashed border-line-strong",
  future: "rounded-sm border-2 border-dotted border-line-strong",
};

function Dot({
  state,
  today,
  label,
  decorative,
}: {
  state: HabitState;
  today?: boolean;
  label?: string;
  decorative?: boolean;
}) {
  const text = `${label ? `${label}, ` : ""}${today ? "Today, " : ""}${WORDS[state]}`;
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": text, title: text };
  return (
    <span
      data-slot="habit-dot"
      data-state={state}
      data-today={today ? "" : undefined}
      {...a11y}
      className={cn(
        "inline-flex size-icon-md flex-none items-center justify-center rounded-pill",
        SHAPES[state],
        today && "outline-2 outline-focus-ring outline-offset-3",
      )}
    >
      {state === "done" ? (
        <span aria-hidden="true" className="hidden forced-colors:inline">
          ✓
        </span>
      ) : null}
    </span>
  );
}

/** The calm dot grid for a habit. A day not done is a hollow dot, not a gap in a chain. */
export function HabitDots(props: HabitDotsProps): ReactElement {
  const days = (props.days || []).map((d) => {
    const v: HabitDay = typeof d === "string" ? { state: d } : d;
    return {
      state: v.state in WORDS ? v.state : ("future" as HabitState),
      today: !!v.today,
      label: v.label,
    };
  });
  const week = props.columns === "week";
  const first = (props.days || [])[0];
  const weekday = typeof first === "object" && first ? first.weekday : undefined;
  const offset =
    week && typeof weekday === "number" && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ? weekday
      : 0;
  const states = Object.keys(WORDS) as HabitState[];
  return (
    <div data-slot="habit-dots" className="@container flex flex-col gap-fluid-stack">
      {props.name ? (
        <div data-slot="habit-name" className="text-body font-semibold">
          {props.name}
        </div>
      ) : null}
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would announce a form group; this is a read-only record */}
      <div
        data-slot="habit-grid"
        role="group"
        aria-label={`${props.name || "Habit"}, daily record`}
        data-columns={week ? "week" : undefined}
        className={cn(
          "gap-fluid-stack p-1",
          week ? "grid w-max grid-cols-7 justify-items-center" : "flex flex-wrap",
        )}
      >
        {/* Each letter is hidden itself: a display: contents wrapper can lose aria-hidden in WebKit. */}
        {week
          ? WEEKDAY_LETTERS.map(([key, letter]) => (
              <span
                key={`head-${key}`}
                data-slot="habit-weekday"
                aria-hidden="true"
                className="text-center text-label text-ink-muted"
              >
                {letter}
              </span>
            ))
          : null}
        {WEEKDAY_LETTERS.slice(0, offset).map(([key]) => (
          <span
            key={`gap-${key}`}
            data-slot="habit-gap"
            aria-hidden="true"
            className="size-icon-md"
          />
        ))}
        {days.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: days have no id; the record is positional and static
          <Dot key={i} {...d} />
        ))}
      </div>
      {props.runLine ? (
        <div data-slot="habit-run-line" className="text-body-sm text-ink-muted">
          {props.runLine}
        </div>
      ) : null}
      {props.legend ? (
        <div
          data-slot="habit-legend"
          className="flex flex-wrap gap-x-4 gap-y-2 text-body-sm text-ink-muted"
        >
          {states.map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <Dot state={s} decorative />
              {WORDS[s]}
            </span>
          ))}
          <span className="inline-flex items-center gap-2">
            <Dot state="future" today decorative />
            Today
          </span>
        </div>
      ) : null}
      {props.note ? (
        <div data-slot="habit-note" className="text-body-sm text-ink-muted">
          {props.note}
        </div>
      ) : null}
      {props.restartNote ? (
        <div data-slot="habit-note" className="text-body-sm text-ink-muted">
          {props.restartNote}
        </div>
      ) : null}
    </div>
  );
}
