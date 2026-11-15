import { commands } from "@shared/ipc/bindings";
import { watchSettingsChanged } from "@shared/ipc/settingsQueue";
import { useEffect, useState } from "react";

/**
 * `Settings.singleKey`: one `settings_get`, then every `settings-changed`. Until the settings are
 * read, or when they can't be, single keys stay off, so B does nothing and the row menu still works.
 */
export function useSingleKeyOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let eventSeen = false;
    const stop = watchSettingsChanged((settings) => {
      eventSeen = true;
      setOn(settings.singleKey === true);
    });
    commands.settingsGet().then(
      (settings) => {
        if (!cancelled && !eventSeen) setOn(settings.singleKey === true);
      },
      (error: unknown) => console.error("settings_get failed: Inbox keeps single keys off", error),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return on;
}
