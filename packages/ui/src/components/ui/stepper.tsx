import { type KeyboardEvent, type ReactElement, useId } from "react";
import { cn } from "../../lib/utils";
import { IconButton } from "./icon-button";

export interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Shown instead of the number at 0 ("No estimate"). */
  zeroLabel?: string;
  /** The words for a value ("3 sessions"); defaults to the number. */
  valueText?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/** A whole number with − and + buttons. The value is a spinbutton: ↑ and ↓ step, Home and End jump. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  zeroLabel,
  valueText,
  disabled,
  className,
}: StepperProps): ReactElement {
  const labelId = useId();
  const text = value === 0 && zeroLabel ? zeroLabel : valueText ? valueText(value) : String(value);
  const go = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped !== value) onChange(clamped);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target: Record<string, number> = {
      ArrowUp: value + 1,
      ArrowDown: value - 1,
      Home: min,
      End: max,
    };
    if (disabled || !(event.key in target)) return;
    event.preventDefault();
    go(target[event.key] as number);
  };
  return (
    <div data-slot="stepper" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span id={labelId} data-slot="field-label" className="text-body-sm text-ink">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <IconButton
          label={`Decrease ${label}`}
          tabIndex={-1}
          disabled={disabled || value <= min}
          onClick={() => go(value - 1)}
          icon={<span aria-hidden="true">−</span>}
        />
        <div
          role="spinbutton"
          tabIndex={disabled ? undefined : 0}
          aria-labelledby={labelId}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={text}
          aria-disabled={disabled || undefined}
          data-slot="stepper-value"
          onKeyDown={onKeyDown}
          className={cn(
            "flex min-h-hit-min min-w-field-width flex-1 items-center justify-center rounded-md border border-line-strong bg-surface-sunken px-3 py-2 text-body text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            disabled && "border-dashed text-ink-muted",
          )}
        >
          {text}
        </div>
        <IconButton
          label={`Increase ${label}`}
          tabIndex={-1}
          disabled={disabled || value >= max}
          onClick={() => go(value + 1)}
          icon={<span aria-hidden="true">+</span>}
        />
      </div>
    </div>
  );
}
