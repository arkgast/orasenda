import { CommandPalette, type NavPage } from "@orasenda/ui";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { tick, untick } from "../../features/settings/notificationsToggle";
import { openFocusView } from "../../features/today/focusView";
import { usePresets } from "../../features/today/presets";
import type { DisplayInfo, Settings, Theme, TimerView_Serialize } from "../../ipc/bindings";
import { commands, events } from "../../ipc/bindings";
import { latest, load, save, watchSettingsChanged } from "../../ipc/settingsQueue";
import { subscribe } from "../../ipc/subscribe";
import { PAGE_ORDER } from "../PagesButton";
import { paletteCommands } from "./paletteCommands";

type Props = {
  compact: boolean;
  onClose(): void;
  onNavigate(page: NavPage): void;
};

function logged<T>(name: string, promise: Promise<T>): void {
  promise.then(
    (result) => {
      const failed = result as { status?: string; error?: unknown };
      if (failed?.status === "error") console.error(`${name} failed`, failed.error);
    },
    (error: unknown) => console.error(`${name} failed`, error),
  );
}

/**
 * The ⌘K palette (main window). Mounted fresh per opening, so it reads its own snapshot of the
 * timer, settings, presets and displays; each row runs the command its twin button runs.
 */
export function Palette({ compact, onClose, onNavigate }: Props): ReactElement {
  const presets = usePresets();
  const [view, setView] = useState<TimerView_Serialize | null>(null);
  const [settings, setSettings] = useState<Settings | null>(latest());
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);

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
      }),
    [view, settings, presets, displays],
  );

  const change = (patch: Partial<Settings>) => {
    const current = latest() ?? settings;
    if (current) save({ ...current, ...patch });
  };

  const run = (id: string) => {
    const [kind, arg] = id.split(/:(.*)/s);
    switch (kind) {
      case "start":
        return logged("timer_start", commands.timerStart({ quick: false }));
      case "quick":
        return logged("timer_start", commands.timerStart({ quick: true }));
      case "pause":
        return logged("timer_pause", commands.timerPause());
      case "resume":
        return logged("timer_resume", commands.timerResume());
      case "end":
        return logged("timer_stop", commands.timerStop());
      case "fullScreen":
        return void openFocusView({ kind: "fullScreen", displayId: arg });
      case "floater":
        return void openFocusView({ kind: "floater" });
      case "preset":
        return change({ presetId: arg });
      case "theme":
        return change({ theme: arg as Theme });
      case "notifications":
        if (!settings || !view) return;
        return settings.notifySessionEnd ? untick() : tick(view.notifications);
      case "page": {
        const page = PAGE_ORDER.find(({ id: pageId }) => pageId === arg);
        if (page) onNavigate(page.id);
      }
    }
  };

  return <CommandPalette commands={entries} compact={compact} onSelect={run} onClose={onClose} />;
}
