import { commands } from "@shared/ipc/bindings";
import { watchSettingsChanged } from "@shared/ipc/settingsQueue";
import { useEffect, useState } from "react";

/**
 * `Settings.singleKey`: one `settings_get`, then every `settings-changed`. Until the settings are
 * read, or when they can't be, single keys stay off: only the buttons work (the failure side).
 * `failed` says the read failed, so a page can say so (conventions, "Failures are never
 * silent success"); the next `settings-changed` clears it.
 */
export function useSingleKeySetting(): { on: boolean; failed: boolean } {
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let eventSeen = false;
    const stop = watchSettingsChanged((settings) => {
      eventSeen = true;
      setOn(settings.singleKey === true);
      setFailed(false);
    });
    commands.settingsGet().then(
      (settings) => {
        if (!cancelled && !eventSeen) setOn(settings.singleKey === true);
      },
      (error: unknown) => {
        console.error("settings_get failed: single keys stay off", error);
        if (!cancelled && !eventSeen) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return { on, failed };
}
