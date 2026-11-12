import type { JSX, KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { describeShortcut } from "../../lib/shortcuts";
import { timerLayout } from "../../lib/timer-layout";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { IconButton } from "./icon-button";
import { Kbd } from "./kbd";
import { EndIcon, LeaveIcon, PauseIcon, PlayIcon, StartMark } from "./timer-glyphs";
import { TimerRing, type TimerRingProps } from "./timer-ring";
import { TimerStrip } from "./timer-strip";

export interface FullScreenFocusProps extends Omit<TimerRingProps, "size" | "stroke"> {
  /** Fires only after the leave Dialog is confirmed. */
  onExit: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onEnd?: () => void;
  onStart?: () => void;
  /** The host's preset summary, shown centred in the top row while idle or ended. */
  summary?: ReactNode;
  /** Single-key shortcuts are on: Space is the page's key, and the caption and tooltips say so. */
  singleKeys?: boolean;
  /** The session ended: shows "Session ended." and idle, with Start and the summary back. */
  ended?: boolean;
}

// Contract values from the README (the px of space-8, space-4, the fixed tracks and the intent line's
// room), as timer-layout.ts keeps the layout tokens: read here only to size the box for timerLayout.
// Exported so a test can hold them against tokens.json.
export const FOCUS_PX = {
  leaveRow: 44,
  statusRow: 18,
  controlsRow: 52,
  captionRow: 18,
  intentMinTrack: 128,
  insetCompact: 16,
  inset: 64,
  gapRoomy: 16,
  gapTight: 4,
  padRoomy: 32,
  padTight: 8,
} as const;
const FIXED_TRACKS =
  FOCUS_PX.leaveRow + FOCUS_PX.statusRow + FOCUS_PX.controlsRow + FOCUS_PX.captionRow;
const INTENT_MIN_TRACK = FOCUS_PX.intentMinTrack;

interface Geometry {
  layout: ReturnType<typeof timerLayout>;
  roomy: boolean;
  intent: boolean;
}

// Runs from the ResizeObserver only, never on a tick. The box is the section's width and height minus
// space-8 (space-4 below layout-compact-width).
function measure(width: number, height: number): Geometry {
  const compact = width < timerLayout.tokens["layout-compact-width"];
  const inset = compact ? FOCUS_PX.insetCompact : FOCUS_PX.inset;
  const layout = timerLayout({
    contentWidth: width - inset,
    contentHeight: height - inset,
    windowWidth: width,
  });
  const roomy = layout === "ring" && !compact;
  const gap = roomy ? FOCUS_PX.gapRoomy : FOCUS_PX.gapTight;
  const pad = roomy ? FOCUS_PX.padRoomy : FOCUS_PX.padTight;
  const track = height - FIXED_TRACKS - 4 * gap - 2 * pad;
  return { layout, roomy, intent: layout === "ring" || track >= INTENT_MIN_TRACK };
}

function Caption({ keys, verb }: { keys: string; verb: string }): JSX.Element {
  return (
    <>
      <Kbd keys={keys} spoken={describeShortcut(keys).spoken} /> {verb}
    </>
  );
}

/**
 * The Focus window: the time and the intent, one quiet way out, and the controls for the session. A page
 * component that fills its host (the host must have a definite height). It measures its own box with a
 * ResizeObserver and picks the ring or the strip from timerLayout there, never on a tick. The section takes
 * focus on mount so Escape works at once; `onExit` fires only after the Dialog is confirmed.
 */
export function FullScreenFocus({
  onExit,
  onPause,
  onResume,
  onEnd,
  onStart,
  summary,
  singleKeys,
  ended,
  ...ring
}: FullScreenFocusProps): JSX.Element {
  const [leaving, setLeaving] = useState(false);
  const [geometry, setGeometry] = useState<Geometry>({
    layout: "ring",
    roomy: true,
    intent: true,
  });
  const root = useRef<HTMLElement>(null);
  const wasLeaving = useRef(false);
  useEffect(() => {
    root.current?.focus();
  }, []);
  // The Dialog unmounts on close, so hand focus back to the layout (Esc keeps working).
  useEffect(() => {
    if (wasLeaving.current && !leaving) root.current?.focus();
    wasLeaving.current = leaving;
  }, [leaving]);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (box) setGeometry(measure(box.width, box.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const mode = ended ? "idle" : (ring.mode ?? "focus");
  const idle = mode === "idle";
  const paused = mode === "paused";
  const { layout, roomy, intent } = geometry;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || leaving) return;
    // Esc inside the host's PopoverMenu closes only the menu.
    if ((event.target as Element).closest("[data-slot='popover-menu']")) return;
    event.preventDefault();
    event.stopPropagation();
    setLeaving(true);
  };
  const startKeys = singleKeys ? "Space Meta+Enter" : "Meta+Enter";

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the README asks the layout to take focus on mount so Escape works at once; the Leave button is the visible control
    <section
      ref={root}
      data-slot="full-screen-focus"
      data-layout={layout}
      data-intent={intent ? "shown" : "hidden"}
      data-os-esc=""
      tabIndex={-1}
      aria-label="Full-screen focus"
      onKeyDown={onKeyDown}
      className="h-full min-h-window-min-height w-full bg-surface text-ink outline-none"
    >
      <div
        className={cn(
          "flex size-full min-h-0 flex-col items-center",
          roomy ? "gap-4 p-6" : "gap-1 p-2",
          !intent && "**:data-[slot=timer-strip-task]:hidden",
        )}
      >
        <div className="relative flex h-hit-min w-full shrink-0 items-center justify-center">
          {idle ? summary : null}
          <div className="absolute inset-e-0 top-0">
            <IconButton
              label="Leave full screen"
              icon={<LeaveIcon />}
              shortcut="Esc"
              onClick={() => setLeaving(true)}
            />
          </div>
        </div>
        <p
          role="status"
          data-slot="full-screen-focus-status"
          className="m-0 shrink-0 text-body-sm text-ink"
        >
          {ended ? "Session ended." : <span aria-hidden="true">{" "}</span>}
        </p>
        <div
          data-slot="full-screen-focus-ring"
          className="flex min-h-0 w-full flex-1 items-center justify-center"
        >
          {layout === "ring" ? (
            <>
              <TimerRing {...ring} mode={mode} size="fluid" />
              {idle && ring.task ? <span className="sr-only">{ring.task}</span> : null}
            </>
          ) : (
            <TimerStrip
              remaining={ring.remaining}
              remainingLabel={ring.remainingLabel}
              progress={ring.progress}
              mode={mode}
              task={ring.task}
              stacked={layout === "stackedStrip"}
            />
          )}
        </div>
        <div
          data-slot="full-screen-focus-controls"
          className="flex h-control-lg shrink-0 items-center justify-center gap-6"
        >
          {idle ? (
            <Button
              variant="primary"
              size="lg"
              aria-label="Start focus"
              aria-keyshortcuts={startKeys}
              onClick={onStart}
            >
              <StartMark />
              <span aria-hidden="true">Start focus</span>
            </Button>
          ) : (
            <>
              <IconButton
                size="round"
                label={paused ? "Resume session" : "Pause session"}
                icon={paused ? <PlayIcon /> : <PauseIcon />}
                shortcut={singleKeys ? "Space" : undefined}
                keyshortcuts={false}
                onClick={paused ? onResume : onPause}
              />
              <IconButton label="End session" icon={<EndIcon />} shortcut="⌘." onClick={onEnd} />
            </>
          )}
        </div>
        <p
          data-slot="full-screen-focus-caption"
          className="m-0 shrink-0 text-body-sm text-ink-muted"
        >
          {singleKeys ? (
            <Caption keys="Space" verb={idle ? "starts" : paused ? "resumes" : "pauses"} />
          ) : idle ? (
            <Caption keys={"\u2318\u21a9"} verb="starts" />
          ) : (
            <Caption keys="⌘." verb="ends" />
          )}
          {" · "}
          <Caption keys="Esc" verb="leaves" />
        </p>
      </div>
      {leaving ? (
        <Dialog
          title="Leave full screen?"
          description={idle ? undefined : "Your focus session will keep running."}
          confirmLabel="Leave full screen"
          cancelLabel="Stay in full screen"
          scrim
          onCancel={() => setLeaving(false)}
          onConfirm={() => {
            setLeaving(false);
            onExit();
          }}
        />
      ) : null}
    </section>
  );
}
