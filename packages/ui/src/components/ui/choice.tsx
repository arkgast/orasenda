import {
  createContext,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { cn } from "../../lib/utils";

type GroupVariant = "default" | "segmented";

const GroupVariantContext = createContext<GroupVariant>("default");

export interface ChoiceGroupProps {
  /** The group's name, shown as a legend. Omit it only with labelledBy. */
  legend?: ReactNode;
  /** The id of an element that already names the group: renders a radiogroup div instead of a fieldset. */
  labelledBy?: string;
  /** Joined radios for switching parallel lists; defaults to separate chips. */
  variant?: GroupVariant;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

const LEGEND = "mb-2 text-body-sm text-ink";

/** A labelled set of Choice chips: a fieldset with a legend, or a radiogroup named by labelledBy. */
export function ChoiceGroup({
  legend,
  labelledBy,
  variant = "default",
  disabled,
  className,
  children,
}: ChoiceGroupProps): ReactElement {
  const segmented = variant === "segmented";
  const body = segmented ? (
    <div data-slot="choice-track" className="inline-flex">
      {children}
    </div>
  ) : (
    children
  );
  const base = segmented ? "m-0 border-0 p-0" : "m-0 flex flex-wrap gap-2 border-0 p-0";
  return (
    <GroupVariantContext.Provider value={variant}>
      {labelledBy ? (
        <div
          data-slot="choice-group"
          data-variant={variant}
          role="radiogroup"
          aria-labelledby={labelledBy}
          className={cn(base, className)}
        >
          {body}
        </div>
      ) : (
        <fieldset
          data-slot="choice-group"
          data-variant={variant}
          disabled={disabled}
          className={cn(base, className)}
        >
          {legend ? <legend className={LEGEND}>{legend}</legend> : null}
          {body}
        </fieldset>
      )}
    </GroupVariantContext.Provider>
  );
}

export interface ChoiceProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  /** Radio picks one; checkbox picks any. Defaults to radio. */
  type?: "radio" | "checkbox";
  /** A full-width chip with a bold title and one sentence of description. */
  long?: boolean;
  description?: string;
  className?: string;
  children: ReactNode;
}

const CHIP =
  "inline-flex min-h-hit-min cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-surface-raised px-3 py-2 text-ink has-checked:bg-selection has-disabled:cursor-default has-disabled:border-dashed";

const SEGMENT =
  "relative inline-flex min-h-hit-min cursor-pointer items-center justify-center border border-line-strong bg-surface-raised px-4 text-ink -ms-px first:ms-0 first:rounded-s-md last:rounded-e-md hover:bg-surface-sunken has-checked:bg-selection has-checked:font-semibold has-checked:after:absolute has-checked:after:inset-x-0 has-checked:after:bottom-0 has-checked:after:border-b-2 has-checked:after:border-focus has-focus-visible:z-10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring has-disabled:cursor-default has-disabled:border-dashed";

const DOT =
  "m-0 size-icon-md shrink-0 appearance-none rounded-pill border-2 border-line-strong bg-surface-raised checked:border-focus checked:bg-focus checked:inset-ring-2 checked:inset-ring-surface-raised";

const SQUARE =
  "m-0 grid size-icon-md shrink-0 appearance-none place-content-center rounded-none border-2 border-line-strong bg-surface-raised checked:border-focus checked:bg-focus before:hidden checked:before:block before:h-2 before:w-1 before:-mt-px before:rotate-45 before:border-0 before:border-r-2 before:border-b-2 before:border-solid before:border-on-focus";

/** One labelled radio or checkbox chip. The whole label is the target; the native input keeps the keyboard. */
export function Choice({
  type = "radio",
  long,
  description,
  className,
  children,
  ...rest
}: ChoiceProps): ReactElement {
  const segmented = useContext(GroupVariantContext) === "segmented";
  const variant = segmented ? "segmented" : long ? "long" : "default";
  return (
    <label
      data-slot="choice"
      data-variant={variant}
      className={cn(segmented ? SEGMENT : CHIP, long && "w-full items-start p-3", className)}
    >
      <input
        {...rest}
        type={type}
        data-slot="choice-input"
        className={cn(
          type === "checkbox" ? SQUARE : DOT,
          segmented
            ? "sr-only"
            : "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          long && "mt-1",
        )}
      />
      {long ? (
        <span>
          <b className="block font-semibold">{children}</b>
          {description ? (
            <span className="block text-body-sm text-ink-muted">{description}</span>
          ) : null}
        </span>
      ) : (
        children
      )}
    </label>
  );
}
