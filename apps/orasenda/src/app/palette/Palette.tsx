import { PAGE_ORDER } from "@domain/navigation/PagesButton";
import { usePresets } from "@domain/presets/presets";
import { tick, untick } from "@features/settings/notificationsToggle";
import { openFocusView } from "@features/today/focusView";
import { CommandPalette, type NavPage } from "@orasenda/ui";
import type { DisplayInfo, Settings, Theme, TimerView_Serialize } from "@shared/ipc/bindings";
import { commands, events } from "@shared/ipc/bindings";
import { latest, load, save, watchSettingsChanged } from "@shared/ipc/settingsQueue";
import { subscribe } from "@shared/ipc/subscribe";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { paletteCommands } from "./paletteCommands";

type Props = {
  compact: boolean;
  onClose(): void;
  onNavigate(page: NavPage): void;
};

/** Runs a command; resolves to whether it worked. Failures are logged here, shown by the caller. */
async function attempt<T>(name: string, promise: Promise<T>): Promise<boolean> {
  try {
    const result = (await promise) as { status?: string; error?: unknown } | null;
    if (result?.status !== "error") return true;
    console.error(`${name} failed`, result.error);
  } catch (error) {
    console.error(`${name} failed`, error);
  }
  return false;
}

/**
 * The ⌘K palette (main window). Mounted fresh per opening, so it reads its own snapshot of the
 * timer, settings, presets and displays; each row runs the command its twin button runs.
 */
export function Palette({ compact, onClose, onNavigate }: Props): ReactElement {
  const presets = usePresets();
  const [view, setView] = useState<TimerView_Serialize | null>(null);
  const [settings, setSettings] = useState<Settings | null>(latest());
  const [status, setStatus] = useState<string | undefined>();
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [captureKeys, setCaptureKeys] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stopTick = subscribe("timer-tick", events.timerTick.listen, setView);
    commands.timerView().then(
      (current) => {
        if (!cancelled) setView((previous) => previous ?? current);
      },
      (error: unknown) => console.error("timer_view failed", error),
    );
    commands.displaysList().then(
      (list) => {
        if (!cancelled) setDisplays(list);
      },
      (error: unknown) => console.error("displays_list failed", error),
    );
    commands.keyboardState().then(
      (keyboard) => {
        // The current keys, only while the shortcut works: a failed one shows no text.
        if (!cancelled && keyboard.capture.status === "registered") {
          setCaptureKeys(keyboard.capture.display);
        }
      },
      (error: unknown) => console.error("keyboard_state failed", error),
    );
    commands.settingsGet().then(
      (saved) => {
        if (!cancelled) setSettings((previous) => previous ?? saved);
      },
      (error: unknown) => console.error("settings_get failed", error),
    );
    // So `latest()` holds the settings a row builds on, also when no page registered them.
    if (!latest()) load();
    const stopSettings = watchSettingsChanged((changed) => setSettings(changed));
    return () => {
      cancelled = true;
      stopTick();
      stopSettings();
    };
  }, []);

  const entries = useMemo(
    () =>
      paletteCommands({
        view,
        settings,
        presets,
        displays,
        notifications: view?.notifications ?? "unavailable",
        captureKeys,
      }),
    [view, settings, presets, displays, captureKeys],
  );

  const change = (patch: Partial<Settings>): Promise<boolean> => {
    const current = latest() ?? settings;
    return current ? save({ ...current, ...patch }) : Promise.resolve(false);
  };

  const run = (id: string): boolean | Promise<boolean> | undefined => {
    const [kind, arg] = id.split(/:(.*)/s);
    const report = (action: string) => async (worked: boolean) => {
      if (!worked) setStatus(`Couldn't ${action}. Please try again.`);
      return worked;
    };
    const start = (quick: boolean) =>
      attempt("timer_start", commands.timerStart({ quick })).then(report("start focus"));
    switch (kind) {
      case "start":
        return start(false);
      case "quick":
        return start(true);
      case "pause":
        return attempt("timer_pause", commands.timerPause()).then(report("pause"));
      case "resume":
        return attempt("timer_resume", commands.timerResume()).then(report("resume"));
      case "end":
        return attempt("timer_stop", commands.timerStop()).then(report("end the session"));
      case "capture":
        return attempt("capture_open", commands.captureOpen()).then(report("open the capture pad"));
      case "fullScreen":
        return openFocusView({ kind: "fullScreen", displayId: arg }).then(
          report("open the Focus view"),
        );
      case "floater":
        return openFocusView({ kind: "floater" }).then(report("open the Focus view"));
      case "preset":
        return change({ presetId: arg }).then(report("change the preset"));
      case "theme":
        return change({ theme: arg as Theme }).then(report("change the theme"));
      case "notifications": {
        if (!settings || !view) return;
        return settings.notifySessionEnd
          ? untick().then(report("turn off notifications"))
          : tick(view.notifications).then(report("turn on notifications"));
      }
      case "page": {
        const page = PAGE_ORDER.find(({ id: pageId }) => pageId === arg);
        if (page) onNavigate(page.id);
      }
    }
  };

  const select = (id: string) => {
    setStatus(undefined);
    return run(id);
  };

  return (
    <CommandPalette
      commands={entries}
      compact={compact}
      onSelect={select}
      onQueryChange={() => setStatus(undefined)}
      status={status}
      onClose={onClose}
    />
  );
}
