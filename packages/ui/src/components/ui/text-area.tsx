import { type ReactElement, type TextareaHTMLAttributes, useId } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helper?: string;
  error?: string;
  /** False takes the vertical resize handle away, for a field that sits in a fixed-size window. */
  resizable?: boolean;
}

/**
 * A labelled multi-line field. The helper and error lines are linked to the control with
 * aria-describedby, as `<id>-helper` and `<id>-error`; neither is a live region.
 */
export function TextArea({
  label,
  helper,
  error,
  id,
  className,
  rows = 4,
  resizable = true,
  "aria-describedby": describedByProp,
  "aria-invalid": ariaInvalid,
  ...rest
}: TextAreaProps): ReactElement {
  const generated = useId();
  const fieldId = id || generated;
  const describedBy =
    [describedByProp, helper ? `${fieldId}-helper` : "", error ? `${fieldId}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={fieldId} data-slot="field-label" className="text-body-sm text-ink">
        {label}
      </label>
      <textarea
        {...rest}
        rows={rows}
        id={fieldId}
        data-slot="text-area"
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedBy}
        className={cn(
          "block min-h-hit-min min-w-0 w-full rounded-sm border border-line-strong bg-surface-sunken px-3 py-2 font-sans text-body text-ink",
          resizable ? "resize-y" : "resize-none",
          "placeholder:text-ink-muted hover:border-focus",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          "aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-line-strong",
          "disabled:cursor-default disabled:border-dashed disabled:text-ink-muted",
        )}
      />
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
