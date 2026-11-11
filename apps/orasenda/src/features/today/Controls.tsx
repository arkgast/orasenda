import { IconButton, StartButton } from "@orasenda/ui";
import type { ComponentProps, ReactElement } from "react";
import { EndGlyph, PauseGlyph, PlayGlyph } from "../../app/glyphs";

type Props = {
  state: "idle" | "running" | "paused";
  /** Below 400px of width Start reads "Start": the strip's narrow column has no width to switch on. */
  compactStart: boolean;
  /** A start is in flight. */
  starting: boolean;
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
 * element, so focus stays on it when it flips) and End session, `space-6` apart.
 */
export function Controls({
  state,
  compactStart,
  starting,
  unavailable,
  onStart,
  onQuickStart,
  onPauseResume,
  onEnd,
  boxProps,
}: Props): ReactElement {
  const paused = state === "paused";
  return (
    <div {...boxProps} className="flex items-center justify-center gap-6">
      {state === "idle" ? (
        <StartButton
          onStart={onStart}
          onQuickStart={onQuickStart}
          compactLabel={compactStart ? "Start" : undefined}
          singleKeys={starting || unavailable ? undefined : false}
          loading={starting}
          unavailable={unavailable}
        />
      ) : (
        <>
          <IconButton
            id="today-pause"
            size="round"
            label={paused ? "Resume session" : "Pause session"}
            icon={paused ? <PlayGlyph /> : <PauseGlyph />}
            onClick={onPauseResume}
          />
          <IconButton
            size="md"
            label="End session"
            icon={<EndGlyph />}
            shortcut="⌘."
            onClick={onEnd}
          />
        </>
      )}
    </div>
  );
}
