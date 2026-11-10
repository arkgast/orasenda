import type { ReactElement } from "react";
import { cn } from "../../lib/utils";
import { ModeShape, type ModeShapeMode } from "./glyphs";

type BlockType = "deep" | "shallow" | "break" | "routine" | "personal" | "overflow";

export interface TimeBlockProps {
  type?: BlockType;
  title?: string;
  start?: string;
  end?: string;
  now?: boolean;
  height?: number | string;
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

const LABEL: Record<BlockType, string> = {
  deep: "Deep",
  shallow: "Shallow",
  break: "Break",
  routine: "Routine",
  personal: "Personal",
  overflow: "Overflow",
};

const SHAPE: Record<BlockType, ModeShapeMode> = {
  deep: "focus",
  shallow: "shallow",
  break: "break",
  routine: "routine",
  personal: "routine",
  overflow: "overflow",
};

const TONE: Record<BlockType, string> = {
  deep: "bg-focus-soft text-focus",
  break: "bg-break-soft text-break",
  routine: "bg-routine-soft text-routine",
  personal: "bg-routine-soft text-routine",
  shallow: "bg-surface-raised text-ink",
  overflow: "bg-surface-raised text-ink pe-6",
};

/** The pixel height from a number or a "NNpx" string, or null for any other CSS length. */
function pixels(height: TimeBlockProps["height"]): number | null {
  if (typeof height === "number") return height;
  if (typeof height === "string" && /^\d+(\.\d+)?px$/.test(height))
    return Number.parseFloat(height);
  return null;
}

/**
 * A block on the day calendar, sized by its duration at 2px per minute (the minute-scale token).
 * The height is a data scale, so it is set as an inline style from the caller's minutes.
 */
export function TimeBlock({
  type = "deep",
  title,
  start = "",
  end = "",
  now,
  height,
  compact,
  selected,
  disabled,
  onSelect,
}: TimeBlockProps): ReactElement {
  const name = title || LABEL[type];
  const numeric = pixels(height);
  const isCompact = compact == null ? numeric != null && numeric < 60 : compact;
  const label = `${now ? "Now, " : ""}${name}, ${LABEL[type]}, ${start} to ${end}${selected ? ", Selected" : ""}`;
  const style =
    height == null ? undefined : { height: numeric != null ? Math.max(24, numeric) : height };
  const className = cn(
    "group/block relative flex w-full max-w-full min-w-0 border border-line-strong text-start font-sans",
    "rounded-md px-3 py-2",
    isCompact
      ? "min-h-hit-floor flex-row items-center justify-between gap-2 px-2 py-0"
      : "min-h-hit-min flex-col justify-center gap-1",
    TONE[type],
    selected && "border-dashed",
    onSelect && "cursor-pointer",
  );
  const content = (
    <>
      {now && (
        <span aria-hidden="true" className="absolute inset-y-0 start-0 w-1 rounded-s-md bg-focus" />
      )}
      <span
        className={cn(
          "flex min-w-0 items-center gap-1-5 text-body-sm font-semibold",
          isCompact && "flex-1",
        )}
      >
        <ModeShape mode={SHAPE[type]} />
        <span
          className={cn(
            "truncate group-enabled/block:group-hover/block:underline group-enabled/block:group-active/block:underline",
          )}
        >
          {now ? "Now · " : ""}
          {name}
        </span>
      </span>
      <span
        className={cn(
          "font-mono text-label font-normal text-ink-muted tabular-nums",
          isCompact && "flex-none",
        )}
      >
        {isCompact ? "" : `${LABEL[type]} · `}
        {start}
        {isCompact ? "" : `–${end}`}
        {selected ? " · Selected" : ""}
      </span>
      {type === "overflow" && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 end-1 w-3 rounded-sm border border-dashed border-line-strong bg-surface-sunken"
        />
      )}
    </>
  );
  return onSelect ? (
    <button
      type="button"
      data-slot="time-block"
      className={className}
      style={style}
      disabled={disabled}
      onClick={onSelect}
      aria-label={label}
    >
      {content}
    </button>
  ) : (
    <div data-slot="time-block" className={className} style={style} aria-label={label}>
      {content}
    </div>
  );
}
