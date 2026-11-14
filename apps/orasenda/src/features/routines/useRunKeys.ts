import { useSingleKeys } from "@domain/keyboard/useSingleKeys";
import { commands } from "@shared/ipc/bindings";
import { watchSettingsChanged } from "@shared/ipc/settingsQueue";
import { useEffect, useRef, useState } from "react";

/** Anything that takes Esc for itself: the palette, a dialog, an open menu or list. */
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], dialog[open], [role="menu"], [role="listbox"]';

/**
 * `Settings.singleKey`: one `settings_get`, then every `settings-changed`. Until the settings are
 * read, or when they can't be, single keys stay off: only the buttons work (the failure side).
 * `failed` says the read failed, so the run view can say so (conventions, "Failures are never
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
        console.error("settings_get failed: the run view keeps single keys off", error);
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

type Keys = {
  /** `Settings.singleKey`: Enter and S at rest work only while it is on. */
  singleKeys: boolean;
  /** Enter with focus at rest; null when there is no step to answer. */
  done: (() => void) | null;
  /** S with focus at rest; null when there is no step to answer. */
  skip: (() => void) | null;
  /** Esc: End routine while the run is open, Back to routines once it has ended. */
  leave: () => void;
};

/**
 * The run view's keys (spec decision 10). Enter on a focused button is the button's own key; Enter
 * and S with focus at rest (the step name, the page) are single keys, so they follow
 * `keys.single_key` (WCAG 2.1.4) and with it off only the buttons work. Esc is the standard
 * leave key and always works, unless an overlay is open and takes it first (looked for in the
 * capture phase, because the overlay closes on this same Esc).
 */
export function useRunKeys({ singleKeys, done, skip, leave }: Keys): void {
  const map: Record<string, () => void> = {};
  if (done) map.enter = done;
  if (skip) map.s = skip;
  useSingleKeys(map, singleKeys);

  const latest = useRef(leave);
  latest.current = leave;
  useEffect(() => {
    let overlay = false;
    const before = (event: KeyboardEvent) => {
      if (event.key === "Escape") overlay = document.querySelector(OVERLAY) !== null;
    };
    const after = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || overlay || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", before, true);
    window.addEventListener("keydown", after);
    return () => {
      window.removeEventListener("keydown", before, true);
      window.removeEventListener("keydown", after);
    };
  }, []);
}
