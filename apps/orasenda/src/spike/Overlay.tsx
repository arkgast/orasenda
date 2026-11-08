import { Button, IntentPrompt } from "@orasenda/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { commands, events, type OverlayChoice_Deserialize } from "../bindings";
import { subscribe } from "../subscribe";

/** The latest `overlay-show`; `count` keys the prompt so every show starts fresh. */
type Show = { count: number; appName: string };

/** Runs a spike command and logs a failure; the overlay has nothing better to show for one. */
async function logFailure(
  name: string,
  run: () => Promise<{ status: "ok" } | { status: "error"; error: unknown }>,
): Promise<void> {
  try {
    const result = await run();
    if (result.status === "error") console.error(`${name} failed`, result.error);
  } catch (error: unknown) {
    console.error(`${name} failed`, error);
  }
}

/**
 * Shown when `overlay-show` cannot be listened to: the page cannot learn which app it covers,
 * so it offers only the way back. Focused on mount; Escape triggers it too.
 */
function ConnectionFallback({ onReturn }: { onReturn: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    root.current?.querySelector("button")?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onReturn();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onReturn]);

  return (
    <div ref={root} className="overlay-fallback">
      <p>The overlay could not connect.</p>
      <Button variant="primary" size="lg" onClick={onReturn}>
        Back to focus
      </Button>
    </div>
  );
}

/**
 * The overlay window's page: nothing until `overlay-show`, then the design system's
 * `IntentPrompt` for that app, without a Wait button (the wait comes in P6). Tells the backend
 * it is ready once its listener is attached, so a show sent before that is re-sent, not lost.
 * One choice is sent per show; further clicks wait for the next show.
 */
export function Overlay() {
  const [show, setShow] = useState<Show | null>(null);
  const [failed, setFailed] = useState(false);
  const count = show?.count ?? 0;
  // The show count a choice was already sent for.
  const chosen = useRef<number | null>(null);

  const choose = useCallback(
    (choice: OverlayChoice_Deserialize) => {
      if (chosen.current === count) return;
      chosen.current = count;
      void logFailure("spike_overlay_choice", () => commands.spikeOverlayChoice(choice));
    },
    [count],
  );
  const onReturn = useCallback(() => choose({ kind: "return" }), [choose]);

  useEffect(
    () =>
      subscribe(
        "overlay-show",
        events.overlayShow.listen,
        ({ appName }) => setShow((previous) => ({ count: (previous?.count ?? 0) + 1, appName })),
        {
          onListening: () =>
            void logFailure("spike_overlay_ready", () => commands.spikeOverlayReady()),
          onError: () => setFailed(true),
        },
      ),
    [],
  );

  if (failed) return <ConnectionFallback onReturn={onReturn} />;
  if (!show) return null;
  return (
    <IntentPrompt
      key={show.count}
      open
      app={show.appName}
      onReturn={onReturn}
      onContinue={(reason) => choose({ kind: "continue", reason: reason ?? null })}
    />
  );
}
