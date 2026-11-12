import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { MenuBarTimer, type MenuBarTimerProps } from "./menu-bar-timer";

export interface FloatingTimerProps extends Omit<MenuBarTimerProps, "compact"> {
  onPause?: () => void;
  onResume?: () => void;
  onStart?: () => void;
  onOpen?: () => void;
  /** The session ended: shows as idle, says "Session ended." once and offers Start. */
  ended?: boolean;
  /** Every data-* attribute lands on the body, so the host marks the drag region without the component knowing Tauri. */
  [key: `data-${string}`]: string | undefined;
}

const WORD = {
  focus: "Focus",
  break: "Break",
  routine: "Routine",
  warning: "Almost up",
  paused: "Paused",
  idle: "No session",
} as const;

// From this height (README, contract value) the state word of a running session sits on its own line.
export const TALL_HEIGHT = 88;

/**
 * The always-on-top mini timer: a MenuBarTimer beside Pause or Resume (Start while idle or ended) and Open
 * Orasenda. It fills its window between the floater tokens and never changes layout by shape. The only live
 * region is the always-mounted "Session ended." status; the window frame, drag region and context menu are the host's.
 */
export function FloatingTimer({
  onPause,
  onResume,
  onStart,
  onOpen,
  ended,
  remaining,
  remainingLabel,
  progress,
  mode = "focus",
  task,
  ...rest
}: FloatingTimerProps): JSX.Element {
  const body = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const el = body.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      // The body is border-box with a 1px border: the window's height is the border box, not the content box.
      const height =
        entries.at(-1)?.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
      setTall(height >= TALL_HEIGHT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = Object.fromEntries(Object.entries(rest).filter(([key]) => key.startsWith("data-")));
  const shown = ended ? "idle" : mode;
  const quiet = shown === "idle";
  const state = ended ? "Session ended" : WORD[shown];
  return (
    // biome-ignore lint/a11y/useSemanticElements: the README names a group; a fieldset would add a legend and form semantics
    <div
      {...data}
      ref={body}
      data-slot="floating-timer"
      data-mode={shown}
      data-ended={ended ? "true" : undefined}
      data-tall={tall ? "true" : undefined}
      role="group"
      aria-label={`Floating timer, ${state}`}
      className="@container flex size-full min-h-floater-min-height min-w-floater-width max-w-floater-max-width max-h-floater-max-height items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3 text-ink shadow-raised"
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div
          className={cn(
            "flex min-w-0 items-center gap-1-5",
            // The timer sits in the panel: the panel owns the fill and the edge, and the task line joins in P2.
            "*:data-[slot=menu-bar-timer]:border-clear *:data-[slot=menu-bar-timer]:bg-clear *:data-[slot=menu-bar-timer]:p-0 *:data-[slot=menu-bar-timer]:shadow-none *:data-[slot=menu-bar-timer]:**:data-[slot=menu-bar-timer-task]:hidden",
          )}
        >
          <MenuBarTimer
            compact={false}
            remaining={remaining}
            remainingLabel={remainingLabel}
            progress={progress}
            mode={shown}
            task={task}
          />
          {quiet ? (
            <span
              aria-hidden="true"
              className={cn("truncate text-body-sm", ended ? "text-ink" : "text-ink-muted")}
            >
              {ended ? "Session ended." : WORD.idle}
            </span>
          ) : null}
        </div>
        {tall && !quiet ? (
          <span
            data-slot="floating-timer-word"
            aria-hidden="true"
            className="truncate text-body-sm text-ink-muted"
          >
            {WORD[shown]}
          </span>
        ) : null}
      </div>
      <p role="status" data-slot="floating-timer-status" className="sr-only">
        {ended ? "Session ended." : ""}
      </p>
      {quiet ? (
        <Button variant="primary" aria-label="Start focus" className="shrink-0" onClick={onStart}>
          <Icon name="play" size="md" />
          <span aria-hidden="true">Start</span>
        </Button>
      ) : (
        <IconButton
          label={shown === "paused" ? "Resume session" : "Pause session"}
          icon={shown === "paused" ? <Icon name="play" /> : <Icon name="pause" />}
          onClick={shown === "paused" ? onResume : onPause}
        />
      )}
      <IconButton label="Open Orasenda" icon={<Icon name="window" />} onClick={onOpen} />
    </div>
  );
}
