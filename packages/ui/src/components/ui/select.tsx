import { type ReactElement, type SelectHTMLAttributes, useId } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  /** Only for a compact page picker, whose value is the page title. */
  labelHidden?: boolean;
  options: readonly SelectOption[];
  /** A line under the field; it says why a disabled select is off. */
  helper?: string;
}

/** A labelled native select in the Input family. The native control keeps the keyboard and VoiceOver. */
export function Select({
  label,
  labelHidden,
  options,
  helper,
  id,
  className,
  "aria-describedby": describedByProp,
  ...rest
}: SelectProps): ReactElement {
  const generated = useId();
  const fieldId = id || generated;
  const describedBy =
    [describedByProp, helper ? `${fieldId}-helper` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label
        htmlFor={fieldId}
        data-slot="field-label"
        className={cn("text-body-sm text-ink", labelHidden && "sr-only")}
      >
        {label}
      </label>
      <div className="relative">
        <select
          {...rest}
          id={fieldId}
          data-slot="select"
          aria-describedby={describedBy}
          className={cn(
            "block min-h-hit-min w-full min-w-0 cursor-pointer appearance-none rounded-md border border-line-strong bg-surface-sunken py-2 ps-3 pe-8 font-sans text-body text-ink",
            "hover:border-focus",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            "disabled:cursor-default disabled:border-dashed disabled:text-ink-muted",
            labelHidden && "font-semibold",
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          data-slot="select-chevron"
          className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-ink-muted"
        >
          <Icon name="chevron" size="md" />
        </span>
      </div>
      {helper ? (
        <p
          id={`${fieldId}-helper`}
          data-slot="field-helper"
          className="m-0 text-body-sm text-ink-muted"
        >
          {helper}
        </p>
      ) : null}
    </div>
  );
}
