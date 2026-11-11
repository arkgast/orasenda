import type { JSX, ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { describeShortcut } from "../../lib/shortcuts";
import { cn } from "../../lib/utils";
import { Tooltip } from "./tooltip";

export interface IconButtonProps {
  label: string;
  icon: ReactNode;
  shortcut?: string | string[];
  shortcutLabel?: string;
  keyshortcuts?: boolean;
  size?: "md" | "round";
  onClick?: () => void;
  disabled?: boolean;
  "aria-haspopup"?: "menu";
  id?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-describedby"?: string;
}

// Hit targets (hit-min, control-lg) and the 1px border are the fixed sizes. The icon is a line icon at
// icon-lg with a 1.5 stroke; the host's glyph is an inline svg that carries no styling of its own.
const base =
  "inline-grid shrink-0 cursor-pointer place-items-center rounded-md border border-clear bg-clear p-0 text-ink transition-colors duration-quick ease-calm outline-focus-ring outline-offset-2 hover:bg-surface-sunken active:bg-selection focus-visible:outline-2 motion-reduce:transition-none";
const medium = "size-hit-min";
const round = "size-control-lg rounded-pill border-line-strong bg-surface-raised";
const unavailable =
  "disabled:cursor-default disabled:border-dashed disabled:border-line-strong disabled:bg-clear disabled:text-ink-muted";

function line(icon: ReactNode): ReactNode {
  if (!isValidElement(icon) || icon.type !== "svg") return icon;
  const svg = icon as ReactElement<Record<string, unknown>>;
  return cloneElement(svg, {
    className: cn("size-icon-lg", svg.props.className as string | undefined),
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  });
}

export function IconButton({
  label,
  icon,
  shortcut,
  shortcutLabel,
  keyshortcuts,
  size = "md",
  onClick,
  disabled,
  id,
  ...aria
}: IconButtonProps): JSX.Element {
  const chords = shortcut == null ? [] : ([] as string[]).concat(shortcut);
  const shown = shortcutLabel ?? chords.join(" ");
  return (
    <Tooltip label={label} shortcut={shown || undefined}>
      <button
        type="button"
        id={id}
        data-slot="icon-button"
        data-size={size}
        aria-label={label}
        aria-keyshortcuts={
          chords.length && keyshortcuts !== false
            ? chords.map((c) => describeShortcut(c).aria).join(" ")
            : undefined
        }
        aria-describedby={aria["aria-describedby"]}
        aria-haspopup={aria["aria-haspopup"]}
        aria-expanded={aria["aria-expanded"]}
        aria-controls={aria["aria-controls"]}
        disabled={disabled}
        onClick={onClick}
        className={cn(base, size === "round" ? round : medium, unavailable)}
      >
        <span aria-hidden="true" className="inline-flex">
          {line(icon)}
        </span>
      </button>
    </Tooltip>
  );
}
