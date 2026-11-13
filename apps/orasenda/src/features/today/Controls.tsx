import { Icon, IconButton, StartButton } from "@orasenda/ui";
import type { ComponentProps, ReactElement } from "react";

type Props = {
  state: "idle" | "running" | "paused";
  /** A break replaces End session with Skip break and names Pause for what it pauses. */
  inBreak?: boolean;
  /** Below 400px of width Start reads "Start": the strip's narrow column has no width to switch on. */
  compactStart: boolean;
  /** A start is in flight. */
  starting: boolean;
  /** Single-key shortcuts are on: Start and Pause advertise Space. */
  singleKeys: boolean;
  /** The timer never answered: Start keeps its name and the status row says why. */
  unavailable: boolean;
  onStart(): void;
  onQuickStart(): void;
  onPauseResume(): void;
  onEnd(): void;
  /** Focus tracking for the controls' box (`useControlFocus`). */
  boxProps: ComponentProps<"div">;
};

/**
 * Idle: Start focus and Just 2 minutes. Running or paused: the round Pause or Resume button (one
 * element, so focus stays on it when it flips, and when a break starts) and End session, or Skip
 * break in a break (same command, same ⌘.), `space-6` apart.
 */
export function Controls({
  state,
  inBreak = false,
  compactStart,
  starting,
  unavailable,
  singleKeys,
  onStart,
  onQuickStart,
  onPauseResume,
  onEnd,
  boxProps,
}: Props): ReactElement {
  const paused = state === "paused";
  const what = inBreak ? "break" : "session";
  return (
    <div {...boxProps} className="flex items-center justify-center gap-6">
      {state === "idle" ? (
        <StartButton
          onStart={onStart}
          onQuickStart={onQuickStart}
          compactLabel={compactStart ? "Start" : undefined}
          singleKeys={starting || unavailable ? undefined : singleKeys}
          loading={starting}
          unavailable={unavailable}
        />
      ) : (
        <>
          <IconButton
            id="today-pause"
            size="round"
            label={paused ? `Resume ${what}` : `Pause ${what}`}
            icon={paused ? <Icon name="play" /> : <Icon name="pause" />}
            shortcut={singleKeys ? "Space" : undefined}
            keyshortcuts={false}
            onClick={onPauseResume}
          />
          <IconButton
            size="md"
            label={inBreak ? "Skip break" : "End session"}
            icon={<Icon name="stop" />}
            shortcut="⌘."
            onClick={onEnd}
          />
        </>
      )}
    </div>
  );
}
