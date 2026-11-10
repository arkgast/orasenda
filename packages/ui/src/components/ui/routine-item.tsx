import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ReactElement } from "react";
import { cn } from "../../lib/utils";

export interface RoutineItemProps {
  label: string;
  detail?: string;
  done?: boolean;
  defaultDone?: boolean;
  optional?: boolean;
  disabled?: boolean;
  onChange?: (done: boolean) => void;
}

/** One habit inside a routine. The whole row is the checkbox; a done item keeps readable text and gains a tick. */
export function RoutineItem(props: RoutineItemProps): ReactElement {
  const { label, detail, optional, disabled, onChange } = props;
  const state = onChange
    ? { checked: !!props.done }
    : { defaultChecked: !!(props.defaultDone == null ? props.done : props.defaultDone) };
  return (
    <CheckboxPrimitive.Root
      data-slot="routine-item"
      {...state}
      disabled={disabled}
      onCheckedChange={(next) => onChange?.(next === true)}
      className={cn(
        "group flex min-h-hit-min w-full max-w-panel-width cursor-pointer items-start gap-3 rounded-md border border-line-strong bg-surface-raised px-4 py-3 text-start text-ink outline-focus-ring outline-offset-2 transition-colors duration-quick ease-calm focus-visible:outline-2 enabled:hover:bg-surface-sunken enabled:active:bg-selection disabled:cursor-default disabled:border-dashed data-[state=checked]:text-ink-muted motion-reduce:transition-none",
      )}
    >
      <span
        data-slot="routine-item-check"
        aria-hidden="true"
        className="grid size-icon-lg flex-none place-items-center rounded-sm border-2 border-line-strong group-data-[state=checked]:border-break group-data-[state=checked]:bg-break"
      >
        <CheckboxPrimitive.Indicator asChild>
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="size-icon-md fill-none stroke-on-break"
            strokeWidth={2.5}
            focusable="false"
          >
            <path d="M2 6.5 5 9.2 10 3" />
          </svg>
        </CheckboxPrimitive.Indicator>
      </span>
      <span>
        <span data-slot="routine-item-label" className="block text-body">
          {label}
          {optional ? (
            <span className="ms-2 text-label text-routine uppercase">Optional</span>
          ) : null}
        </span>
        {detail ? (
          <span data-slot="routine-item-detail" className="block text-body-sm text-ink-muted">
            {detail}
          </span>
        ) : null}
      </span>
    </CheckboxPrimitive.Root>
  );
}
