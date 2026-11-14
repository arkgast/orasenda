import type { JSX, ReactNode } from "react";
import { describeShortcut } from "../../lib/shortcuts";
import { cn } from "../../lib/utils";
import { Tooltip } from "./tooltip";

/** label is the accessible name and the built-in Tooltip's text; the icon is aria-hidden. shortcut is one canonical glyph string, shown as a Kbd in the tooltip and set as aria-keyshortcuts (describeShortcut(shortcut).aria); pass it only while that shortcut is live. Several chords: an array (aria-keyshortcuts joins them with spaces); shortcutLabel is the text the Kbd shows when it differs (a range such as '⌘1–6'); keyshortcuts={false} shows the Kbd but sets no aria-keyshortcuts (Pause/Resume, whose key belongs to the page). aria-describedby points a disabled button at the line that says why. id, aria-haspopup, aria-expanded and aria-controls land on the button; the host sets aria-expanded and aria-controls from its menu's open state and id. */
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
  /** -1 takes the button out of the tab order (a scroll helper whose action the keyboard has another way to do). */
  tabIndex?: -1 | 0;
}

// Hit targets (hit-min, control-lg) and the 1px border are the fixed sizes. The icon is a line icon at
// icon-lg (sized and unfilled here, through the wrapper, for any svg or component icon). Stroke width and
// caps are SVG attributes with no theme utility, so the glyph carries strokeWidth 1.5 and round caps itself.
const base =
  "inline-grid shrink-0 cursor-pointer place-items-center rounded-md border border-clear bg-clear p-0 text-ink transition-colors duration-quick ease-calm outline-focus-ring outline-offset-2 hover:bg-surface-sunken active:bg-selection focus-visible:outline-2 motion-reduce:transition-none";
const medium = "size-hit-min";
const round = "size-control-lg rounded-pill border-line-strong bg-surface-raised";
const unavailable =
  "disabled:cursor-default disabled:border-dashed disabled:border-line-strong disabled:bg-clear disabled:text-ink-muted";

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
        tabIndex={aria.tabIndex}
        disabled={disabled}
        onClick={onClick}
        className={cn(base, size === "round" ? round : medium, unavailable)}
      >
        <span aria-hidden="true" className="inline-flex fill-none stroke-current *:size-icon-lg">
          {icon}
        </span>
      </button>
    </Tooltip>
  );
}
