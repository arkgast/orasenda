import type { ButtonHTMLAttributes, JSX, MouseEvent } from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "break" | "quiet" | "ghost" | "critical";
  size?: "md" | "lg";
  loading?: boolean;
}

// Hit targets (min-h-hit-min, min-w-hit-min) and the 1px border are the only fixed sizes; padding
// follows the fluid tokens, which scale with the container the button sits in.
const base =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-line-strong bg-surface-raised px-fluid-stack py-2 font-semibold text-body text-ink transition-colors duration-quick ease-calm min-h-hit-min min-w-hit-min outline-focus-ring outline-offset-2 focus-visible:outline-2 motion-reduce:transition-none";

const variants = {
  primary:
    "rounded-pill border-focus bg-focus text-on-focus hover:border-focus-hover hover:bg-focus-hover active:border-focus-pressed active:bg-focus-pressed",
  break:
    "rounded-pill border-break bg-break text-on-break hover:border-break-hover hover:bg-break-hover active:border-break-pressed active:bg-break-pressed",
  quiet: "hover:bg-surface-sunken active:bg-selection",
  ghost:
    "border-clear bg-clear text-ink-muted hover:bg-surface-sunken hover:text-ink active:bg-selection active:text-ink",
  critical:
    "border-critical bg-critical text-on-critical hover:bg-critical-soft hover:text-critical active:bg-critical-soft active:text-critical",
} as const;

// The disabled look is a dashed line-strong border on a sunken fill with full-contrast muted text, never opacity.
const unavailable =
  "disabled:cursor-default disabled:border-dashed disabled:border-line-strong disabled:bg-surface-sunken disabled:text-ink-muted aria-disabled:cursor-default aria-disabled:border-dashed aria-disabled:border-line-strong aria-disabled:bg-surface-sunken aria-disabled:text-ink-muted aria-busy:cursor-progress";

export function Button({
  variant = "quiet",
  size = "md",
  loading,
  className,
  onClick,
  disabled,
  ...rest
}: ButtonProps): JSX.Element {
  const blocked =
    !!disabled || !!loading || rest["aria-disabled"] === true || rest["aria-disabled"] === "true";
  return (
    <button
      type="button"
      {...rest}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={!!disabled || !!loading}
      aria-busy={loading ? true : rest["aria-busy"]}
      onClick={blocked ? (event: MouseEvent<HTMLButtonElement>) => event.preventDefault() : onClick}
      className={cn(
        base,
        variants[variant],
        size === "lg" && "min-h-control-lg px-fluid-gutter text-heading",
        unavailable,
        className,
      )}
    />
  );
}
