import { type InputHTMLAttributes, type ReactElement, useId } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helper?: string;
  error?: string;
  /** Adds a suffix ("min") after a number field sized to number-width. */
  unit?: string;
}

/**
 * A labelled single-line field. The helper and error lines are linked to the control with
 * aria-describedby, as `<id>-helper` and `<id>-error`; neither is a live region.
 */
export function Input({
  label,
  helper,
  error,
  unit,
  id,
  className,
  "aria-describedby": describedByProp,
  "aria-invalid": ariaInvalid,
  ...rest
}: InputProps): ReactElement {
  const generated = useId();
  const fieldId = id || generated;
  const describedBy =
    [describedByProp, helper ? `${fieldId}-helper` : "", error ? `${fieldId}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const control = (
    <input
      {...rest}
      id={fieldId}
      data-slot="input"
      aria-invalid={error ? true : ariaInvalid}
      aria-describedby={describedBy}
      className={cn(
        "block min-h-hit-min min-w-0 rounded-sm border border-line-strong bg-surface-sunken px-3 py-2 font-sans text-body text-ink",
        "placeholder:text-ink-muted hover:border-focus",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        "aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-line-strong",
        "disabled:cursor-default disabled:border-dashed disabled:text-ink-muted",
        unit ? "w-number-width max-w-full" : "w-full",
      )}
    />
  );
  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={fieldId} data-slot="field-label" className="text-body-sm text-ink">
        {label}
      </label>
      {unit ? (
        <div data-slot="input-unit" className="flex flex-wrap items-center gap-2">
          {control}
          <span className="text-body-sm text-ink-muted">{unit}</span>
        </div>
      ) : (
        control
      )}
      {helper ? (
        <p
          id={`${fieldId}-helper`}
          data-slot="field-helper"
          className="m-0 flex items-baseline gap-2 text-body-sm text-ink-muted"
        >
          {helper}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${fieldId}-error`}
          data-slot="field-error"
          className="m-0 flex items-baseline gap-2 text-body-sm text-ink-muted"
        >
          <Icon name="alert" size="md" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
