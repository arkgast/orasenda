import type { JSX, KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { describeShortcut } from "../../lib/shortcuts";
import { timerLayout } from "../../lib/timer-layout";
import { cn } from "../../lib/utils";
import { Button } from "./button";
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
  /** Leaves full screen at once: the Leave button and Esc both call it, with no confirmation. */
  onLeave: () => void;
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
   * Zero to two quiet actions in the controls row, after End. Two for the keep-going offer
   * ("Keep going", "Stop here") or for a break ("+10 min", "Skip break"). Only the first two render; a third is dropped, so the host passes at most two.
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
  /**
   * The key hint under the controls. `visible` false fades it over `duration-slow` (at once under reduce
   * motion) and hides it from readers, but its row keeps its height. Without `hint`, the row shows the
   * static caption for the current keys.
   */
  hint?: { text: string; visible: boolean };
}

// Contract values from the README (the px of space-8, space-4 and the fixed tracks), as timer-layout.ts keeps the layout tokens: read here only to size the box for timerLayout.
// Exported so a test can hold them against tokens.json.
export const FOCUS_PX = {
  leaveRow: 44,
  statusRow: 18,
  controlsRow: 52,
  captionRow: 18,
  insetCompact: 16,
  inset: 64,
  gapRoomy: 16,
  gapTight: 4,
  padRoomy: 32,
  padTight: 8,
} as const;

interface Geometry {
  layout: ReturnType<typeof timerLayout>;
  roomy: boolean;
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
  return { layout, roomy };
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
 * The Focus window: the time, one quiet way out, and the controls for the session. A page
 * component that fills its host (the host must have a definite height). It measures its own box with a
 * ResizeObserver and picks the ring or the strip from timerLayout there, never on a tick. The section takes
 * focus on mount so Escape works at once; Esc and the Leave button call `onLeave` at once.
 */
export function FullScreenFocus({
  onLeave,
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
  hint,
  ...ring
}: FullScreenFocusProps): JSX.Element {
  const [geometry, setGeometry] = useState<Geometry>({
    layout: "ring",
    roomy: true,
  });
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.focus();
  }, []);
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
  const { layout, roomy } = geometry;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    // Esc inside the host's PopoverMenu closes only the menu.
    if ((event.target as Element).closest("[data-slot='popover-menu']")) return;
    event.preventDefault();
    event.stopPropagation();
    onLeave();
  };
  const isBreak = (phase ?? (mode === "break" ? "break" : "focus")) === "break";
  const noun = isBreak ? "break" : "session";
  // The keep-going offer stands in for Start: "Keep going" starts the next session and is the one primary, and
  // Start, "Keep going" and "Stop here" together would not fit the fixed track at the window minimum.
  const actions = secondaryActions?.slice(0, 2) ?? [];
  const offer = idle && offerProp === true && actions.length > 0;
  const gapClass =
    actions.length === 2 && !offer && !roomy ? "gap-1-5" : gapByActions[actions.length];
  const startKeys = singleKeys ? "Space Meta+Enter" : "Meta+Enter";

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the README asks the layout to take focus on mount so Escape works at once; the Leave button is the visible control
    <section
      ref={root}
      data-slot="full-screen-focus"
      data-layout={layout}
      data-os-esc=""
      tabIndex={-1}
      aria-label="Full-screen focus"
      onKeyDown={onKeyDown}
      className="h-full min-h-window-min-height w-full bg-surface text-ink outline-none"
    >
      <div
        className={cn(
          "flex size-full min-h-0 flex-col items-center",
          roomy ? "gap-4 px-6 pt-6 pb-0" : "gap-1 p-2",
        )}
      >
        <div className="relative flex h-hit-min w-full shrink-0 items-center justify-center">
          {idle ? summary : null}
          <div className="absolute inset-e-0 top-0">
            <IconButton
              label="Leave full screen"
              icon={<Icon name="collapse" />}
              shortcut="Esc"
              onClick={onLeave}
            />
          </div>
        </div>
        <p
          role="status"
          data-slot="full-screen-focus-status"
          className="m-0 w-full shrink-0 truncate text-center text-body-sm text-ink"
        >
          {status ?? (ended ? "Session ended." : <span aria-hidden="true">{" "}</span>)}
        </p>
        <div
          data-slot="full-screen-focus-ring"
          className={cn(
            "flex min-h-0 w-full items-center justify-center",
            // Roomy: the ring stops at timer-full-size and the lower region takes the rest, so the controls stay centred below it.
            roomy ? "max-h-timer-full-size shrink grow-0 basis-full" : "flex-1",
          )}
        >
          {layout === "ring" ? (
            <TimerRing {...ring} mode={mode} size="fluid" />
          ) : (
            <TimerStrip
              remaining={ring.remaining}
              remainingLabel={ring.remainingLabel}
              progress={ring.progress}
              mode={mode}
              stacked={layout === "stackedStrip"}
            />
          )}
        </div>
        <div
          data-slot="full-screen-focus-lower"
          className={cn(
            "relative w-full shrink-0",
            roomy ? "flex grow flex-col justify-center py-6" : "flex flex-col gap-1",
          )}
        >
          <div
            data-slot="full-screen-focus-controls"
            className={cn(
              "flex h-control-lg w-full shrink-0 items-center justify-center",
              // The flex gap above the lower region (space-4) puts the centre of the region 8px below the midpoint
              // between the bottom of the ring and the bottom of the view; this lifts the row onto it.
              roomy && "-translate-y-2",
              // Room for the host's actions without growing the fixed track: the gap tightens with each one.
              // Two break actions beside Pause and End are 2px too wide for the specimen frame's 344px track at
              // 360x240 (24px padding); the real window's 12px padding fits. A narrower gap, not padding, takes it up.
              gapClass,
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
              <div className={cn("flex items-center", roomy ? "gap-8" : gapClass)}>
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
              </div>
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
            aria-hidden={hint && !hint.visible ? "true" : undefined}
            className={cn(
              "m-0 text-center text-body-sm text-ink-muted",
              // In the roomy ring the row sits in the bottom slack, so the controls stay centred between the ring and the view's bottom.
              roomy ? "absolute inset-x-0 bottom-2" : "shrink-0",
              hint && "transition-opacity duration-slow ease-calm motion-reduce:transition-none",
              hint && !hint.visible && "opacity-0",
            )}
          >
            {hint ? (
              hint.text
            ) : (
              <>
                {singleKeys ? (
                  <Caption keys="Space" verb={idle ? "starts" : paused ? "resumes" : "pauses"} />
                ) : idle ? (
                  <Caption keys={"\u2318\u21a9"} verb="starts" />
                ) : (
                  <Caption keys="⌘." verb="ends" />
                )}
                {" · "}
                <Caption keys="Esc" verb="leaves" />
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
