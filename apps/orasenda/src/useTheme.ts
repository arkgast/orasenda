import { useEffect } from "react";
import type { Theme } from "./bindings";
import { commands } from "./bindings";
import { watchSettingsChanged } from "./settingsQueue";

function apply(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/**
 * Keeps `<html data-theme>` on Rust's theme: one `settings_get` at mount, then every
 * `settings-changed` (through the queue's single listener). An event that arrives before the
 * get's answer wins and the answer is dropped. It never follows the optimistic radio.
 */
export function useTheme(): void {
  useEffect(() => {
    let cancelled = false;
    let eventSeen = false;
    const stop = watchSettingsChanged((settings) => {
      eventSeen = true;
      apply(settings.theme);
    });
    commands.settingsGet().then(
      (settings) => {
        if (!cancelled && !eventSeen) apply(settings.theme);
      },
      (error: unknown) => console.error("settings_get failed (theme)", error),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
}
