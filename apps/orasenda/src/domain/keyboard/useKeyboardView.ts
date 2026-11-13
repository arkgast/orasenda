import type { KeyboardView } from "@shared/ipc/bindings";
import { commands, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useEffect, useState } from "react";

/**
 * The global shortcuts as the app sees them, read only: `keyboard_state`, kept current by
 * `keyboard-changed`. `setView` is for Settings, which takes the reply of its own change.
 */
export function useKeyboardView() {
  const [view, setView] = useState<KeyboardView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const stop = subscribe("keyboard-changed", events.keyboardChanged.listen, (next) => {
      setLoadFailed(false);
      setView(next);
    });
    commands.keyboardState().then(
      (first) => {
        // An event that already arrived is newer than this first read.
        if (live) setView((current) => current ?? first);
      },
      (error: unknown) => {
        console.error("keyboard_state failed", error);
        if (live) setLoadFailed(true);
      },
    );
    return () => {
      live = false;
      stop();
    };
  }, []);

  return { view, setView, loadFailed };
}
