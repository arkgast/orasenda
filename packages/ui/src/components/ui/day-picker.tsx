import { type ReactElement, useId } from "react";
import { cn } from "../../lib/utils";

export interface DayPickerProps {
  /** Names the group for VoiceOver, e.g. "Repeat on". Also shown above the days. */
  label: string;
  /** The weekday mask: Monday = 1, Tuesday = 2 … Sunday = 64. Bits above Sunday are ignored. */
  value: number;
  /** Called with the new mask. Never called with 0 once a day is on. */
  onChange: (value: number) => void;
  /** The host's line under the days while two or more are on, e.g. Rust's "Weekdays". */
  helper?: string;
  disabled?: boolean;
  className?: string;
}

const DAYS = [
  { key: "monday", letter: "M", name: "Monday" },
  { key: "tuesday", letter: "T", name: "Tuesday" },
  { key: "wednesday", letter: "W", name: "Wednesday" },
  { key: "thursday", letter: "T", name: "Thursday" },
  { key: "friday", letter: "F", name: "Friday" },
  { key: "saturday", letter: "S", name: "Saturday" },
  { key: "sunday", letter: "S", name: "Sunday" },
] as const;

const ALL = 0b1111111;
const LAST_DAY = "At least one day stays on.";
const DEFAULT_HELPER = "Pick the days it runs.";

// Off is a line-strong outline with a regular letter; on is a filled focus rounded rectangle with a bold letter. Shape and
// weight carry the state, so it never rests on colour alone; aria-pressed carries it for VoiceOver.
// Hover only changes a day that can be pressed: the locked last day keeps its fill.
const DAY =
  "inline-grid size-hit-min flex-none cursor-pointer place-items-center rounded-md border-2 border-line-strong bg-surface-raised text-body text-ink outline-focus-ring outline-offset-2 transition-colors duration-quick ease-calm not-aria-disabled:hover:bg-surface-sunken focus-visible:outline-2 aria-pressed:border-focus aria-pressed:bg-focus aria-pressed:font-semibold aria-pressed:text-on-focus aria-pressed:not-aria-disabled:hover:border-focus-hover aria-pressed:not-aria-disabled:hover:bg-focus-hover aria-disabled:cursor-default disabled:cursor-default disabled:border-dashed motion-reduce:transition-none forced-colors:aria-pressed:border-4";

const bits = (value: number) => value & ALL;
const count = (mask: number) => DAYS.filter((_, i) => mask & (1 << i)).length;

/** Seven toggle buttons for the days a routine runs. The last day that is on stays on. */
export function DayPicker({
  label,
  value,
  onChange,
  helper,
  disabled,
  className,
}: DayPickerProps): ReactElement {
  const id = useId();
  const mask = bits(value);
  const lastOne = count(mask) === 1;
  const line = lastOne
    ? helper
      ? `${helper}. ${LAST_DAY}`
      : LAST_DAY
    : (helper ?? DEFAULT_HELPER);
  return (
    <div data-slot="day-picker-field" className={cn("flex flex-col gap-2", className)}>
      <span id={`${id}-label`} className="text-body-sm text-ink">
        {label}
      </span>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would need a legend; the visible label names the group */}
      <div
        data-slot="day-picker"
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-helper`}
        className="flex flex-wrap gap-2"
      >
        {DAYS.map((day, i) => {
          const bit = 1 << i;
          const on = (mask & bit) !== 0;
          const locked = on && lastOne;
          return (
            <button
              key={day.key}
              type="button"
              data-slot="day-picker-day"
              data-day={day.key}
              aria-pressed={on}
              aria-disabled={locked || undefined}
              aria-describedby={locked ? `${id}-helper` : undefined}
              disabled={disabled}
              onClick={() => {
                if (locked) return;
                onChange(on ? mask & ~bit : mask | bit);
              }}
              className={DAY}
            >
              <span data-slot="day-picker-letter" aria-hidden="true">
                {day.letter}
              </span>
              <span className="sr-only">{day.name}</span>
            </button>
          );
        })}
      </div>
      <p
        id={`${id}-helper`}
        data-slot="day-picker-helper"
        className="m-0 text-body-sm text-ink-muted"
      >
        {line}
      </p>
    </div>
  );
}
