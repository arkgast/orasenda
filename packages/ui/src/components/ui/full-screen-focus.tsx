import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { TimerRing, type TimerRingProps } from "./timer-ring";

export interface FullScreenFocusProps extends Omit<TimerRingProps, "size" | "stroke"> {
  onExit: () => void;
}

/**
 * The Focus window: a fluid ring, the task, a small wall clock and one quiet way out. A page component, so
 * its margins follow the viewport: space-4 below `sm`, space-8 above. The layout takes focus on mount so Escape
 * works at once; `onExit` fires only after the Dialog is confirmed.
 */
export function FullScreenFocus({ onExit, ...ring }: FullScreenFocusProps): JSX.Element {
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.focus();
  }, []);
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the README asks the layout to take focus on mount so Escape works at once; the Leave button is the visible control
    <section
      ref={root}
      data-slot="full-screen-focus"
      tabIndex={-1}
      aria-label="Full-screen focus"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !leaving) {
          event.preventDefault();
          event.stopPropagation();
          setLeaving(true);
        }
      }}
      className="flex h-full min-h-window-min-height flex-col items-center justify-center gap-6 bg-surface p-4 text-ink outline-none sm:p-8"
    >
      <div
        data-slot="full-screen-focus-ring"
        className="flex min-h-0 w-full flex-1 items-center justify-center"
      >
        <TimerRing {...ring} size="fluid" />
      </div>
      <Button variant="ghost" onClick={() => setLeaving(true)}>
        Leave full screen
      </Button>
      {leaving ? (
        <Dialog
          title="Leave full screen?"
          description="Your focus session will keep running."
          confirmLabel="Leave full screen"
          cancelLabel="Stay focused"
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
