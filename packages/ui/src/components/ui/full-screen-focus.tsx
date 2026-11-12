import type { JSX, KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { describeShortcut } from "../../lib/shortcuts";
import { timerLayout } from "../../lib/timer-layout";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Kbd } from "./kbd";
import { TimerRing, type TimerRingProps } from "./timer-ring";
import { TimerStrip } from "./timer-strip";

/** A quiet action beside Pause and End, as the host passes it ("+10 min", "Skip break", "Keep going"). */
export interface SecondaryAction {
  id: string;
  /** The visible words. */
  label: string;
  /** The accessible name when it says more than the label ("Add 10 minutes of focus"). */
  name?: string;
  onSelect: () => void;
}

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
  /**
   * The host's one line for the status row (a failed command, an unreadable timer). It takes the place of
   * "Session ended." while set, in the same live region.
   */
  status?: string;
  /**
   * Zero to two quiet actions in the controls row, after End. Two only for the keep-going offer
   * ("Keep going", "Stop here"). Only the first two render; a third is dropped, so the host passes at most two.
   * Pause or Resume stays the only round primary.
   */
  secondaryActions?: ReadonlyArray<SecondaryAction>;
  /**
   * The host's phase, which a break's last 2:00 (`mode="warning"`) and a paused break (`mode="paused"`) cannot
   * say. Defaults to "break" when `mode` is "break", else "focus". In a break, End reads "End break" and the
   * round button "Pause break" or "Resume break".
   */
  phase?: "focus" | "break";
  /**
   * The keep-going offer is showing (idle). The first action then stands in for Start as the one primary, the
   * second is ghost, and Start is not drawn. Without it, idle always shows Start.
   */
  offer?: boolean;
}

// Contract values from the README (the px of space-8, space-4, the fixed tracks and the intent line's
// room), as timer-layout.ts keeps the layout tokens: read here only to size the box for timerLayout.
// Exported so a test can hold them against tokens.json.
export const FOCUS_PX = {
  leaveRow: 44,
  statusRow: 18,
  controlsRow: 52,
  captionRow: 18,
  // A free contract value from the README (the intent line's minimum track), not a token.
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

const gapByActions = ["gap-6", "gap-4", "gap-2"] as const;

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
  status,
  secondaryActions,
  phase,
  offer: offerProp,
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
  const isBreak = (phase ?? (mode === "break" ? "break" : "focus")) === "break";
  const noun = isBreak ? "break" : "session";
  // The keep-going offer stands in for Start: "Keep going" starts the next session and is the one primary, and
  // Start, "Keep going" and "Stop here" together would not fit the fixed track at the window minimum.
  const actions = secondaryActions?.slice(0, 2) ?? [];
  const offer = idle && offerProp === true && actions.length > 0;
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
              icon={<Icon name="collapse" />}
              shortcut="Esc"
              onClick={() => setLeaving(true)}
            />
          </div>
        </div>
        <p
          role="status"
          data-slot="full-screen-focus-status"
          className="m-0 shrink-0 truncate text-body-sm text-ink"
        >
          {status ?? (ended ? "Session ended." : <span aria-hidden="true">{" "}</span>)}
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
          className={cn(
            "flex h-control-lg w-full shrink-0 items-center justify-center",
            // Room for the host's actions without growing the fixed track: the gap tightens with each one.
            gapByActions[actions.length],
          )}
        >
          {offer ? null : idle ? (
            <Button
              variant="primary"
              size="lg"
              aria-label="Start focus"
              aria-keyshortcuts={startKeys}
              onClick={onStart}
            >
              <Icon name="play" />
              <span aria-hidden="true">Start focus</span>
            </Button>
          ) : (
            <>
              <IconButton
                size="round"
                label={paused ? `Resume ${noun}` : `Pause ${noun}`}
                icon={paused ? <Icon name="play" /> : <Icon name="pause" />}
                shortcut={singleKeys ? "Space" : undefined}
                keyshortcuts={false}
                onClick={paused ? onResume : onPause}
              />
              <IconButton
                label={`End ${noun}`}
                icon={<Icon name="stop" />}
                shortcut="⌘."
                onClick={onEnd}
              />
            </>
          )}
          {actions.map((action, index) => (
            <Button
              key={action.id}
              variant={index === 0 ? (offer ? "primary" : "quiet") : "ghost"}
              size={offer && index === 0 ? "lg" : undefined}
              aria-label={action.name}
              onClick={action.onSelect}
              className="shrink-0"
            >
              {action.name ? <span aria-hidden="true">{action.label}</span> : action.label}
            </Button>
          ))}
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
