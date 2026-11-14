import { commands, events, type WindowView_Serialize } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useEffect, useState } from "react";

const WINDOWED: WindowView_Serialize = { fullScreen: false, display: null, hintsLeft: 0 };

/**
 * `main`'s native full-screen state (ADR-019): `window_view()` on mount, then every `window-view`
 * event. The event wins over a getter answer that arrives after it. Rust owns the state; the
 * webview only reads it, and a failed getter leaves it windowed (and logs).
 */
export function useWindowView(): WindowView_Serialize {
  const [view, setView] = useState<WindowView_Serialize>(WINDOWED);
  useEffect(() => {
    let cancelled = false;
    let eventSeen = false;
    const stop = subscribe("window-view", events.windowView.listen, (next) => {
      eventSeen = true;
      setView(next);
    });
    commands.windowView().then(
      (current) => {
        if (!cancelled && !eventSeen) setView(current);
      },
      (error: unknown) => console.error("window_view failed", error),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return view;
}
