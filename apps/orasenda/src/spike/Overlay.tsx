import { IntentPrompt } from "@orasenda/ui";
import { useEffect, useState } from "react";
import { commands, events, type OverlayChoice_Deserialize } from "../bindings";

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

function choose(choice: OverlayChoice_Deserialize): void {
  void logFailure("spike_overlay_choice", () => commands.spikeOverlayChoice(choice));
}

/**
 * The overlay window's page: nothing until `overlay-show`, then the design system's
 * `IntentPrompt` for that app, without a Wait button (the wait comes in P6). Tells the backend
 * it is ready once its listener is attached, so a show sent before that is re-sent, not lost.
 */
export function Overlay() {
  const [show, setShow] = useState<Show | null>(null);

  useEffect(() => {
    let cancelled = false;
    const listening = events.overlayShow.listen((event) => {
      if (cancelled) return;
      setShow((previous) => ({
        count: (previous?.count ?? 0) + 1,
        appName: event.payload.appName,
      }));
    });
    listening.then(
      () => {
        if (!cancelled) void logFailure("spike_overlay_ready", () => commands.spikeOverlayReady());
      },
      (error: unknown) => console.error("overlay-show listen failed", error),
    );
    return () => {
      cancelled = true;
      listening.then(
        // `UnlistenFn` is typed `() => void` but returns a promise at runtime.
        (unlisten) =>
          Promise.resolve(unlisten()).catch((error: unknown) =>
            console.error("overlay-show unlisten failed", error),
          ),
        // Already logged above; there is nothing to unlisten.
        () => {},
      );
    };
  }, []);

  if (!show) return null;
  return (
    <IntentPrompt
      key={show.count}
      open
      app={show.appName}
      onReturn={() => choose({ kind: "return" })}
      onContinue={(reason) => choose({ kind: "continue", reason: reason ?? null })}
    />
  );
}
