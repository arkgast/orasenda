import { selectedPreset, usePresets, usePresetsFailed } from "@domain/presets/presets";
import { useTimer } from "@domain/timer/useTimer";
import type { Settings as SettingsValue } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { latest, load, register, save } from "@shared/ipc/settingsQueue";
import { useEffect, useState, useSyncExternalStore } from "react";
import { askingKey, pendingKeys, subscribeAsking } from "./notificationsToggle";
import { notificationsRow } from "./panes/Notifications";
import { changedKeys, type Key } from "./settingsKeys";
import { buildNotice, type Line, READ_ONLY, WRITE_REASON } from "./settingsNotice";
import { usePresetEditing } from "./usePresets";

// What the page shows until the first settings_get answers (or when the store is unavailable).
const DEFAULT_SETTINGS: SettingsValue = {
  theme: "system",
  presetId: "0192f6a0-0000-7000-8000-000000000002",
  extensionCap: 2,
  autoContinue: false,
  longestFocusMin: 90,
  deepCapOn: true,
  deepCapHours: 4,
  notifySessionEnd: false,
  notifyTwoMinutes: false,
  singleKey: true,
};

const noop = () => {};

/** Everything the panes share: the saved settings, the presets, the save line and the failures. */
export function useSettingsModel() {
  const timer = useTimer({ onMilestone: noop });
  const view = timer.status === "ok" ? timer.view : null;
  const [settings, setSettings] = useState<SettingsValue | null>(null);
  const presets = usePresets();
  const presetsFailed = usePresetsFailed();
  const [line, setLine] = useState<Line>({ kind: "rest" });
  const editor = usePresetEditing(presets, selectedPreset(presets, settings)?.id, () =>
    setLine({ kind: "rest" }),
  );
  const [loadError, setLoadError] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const askingFor = useSyncExternalStore(subscribeAsking, askingKey);
  const ticked = useSyncExternalStore(subscribeAsking, pendingKeys);
  const [savedLine, setSavedLine] = useState<string | null>(null);

  useEffect(() => {
    const unregister = register({
      shown: (shown) => {
        setLoadError(false);
        setSettings(shown);
      },
      accepted: () => {},
      loadFailed: () => setLoadError(true),
      saveFailed: (sent, restored, cause) => {
        setLine({ kind: "failed", sent, restored, cause, keys: changedKeys(sent, restored) });
      },
    });
    load();
    return unregister;
  }, []);

  const shown = settings ?? DEFAULT_SETTINGS;
  const store = view?.store ?? "ok";
  const readOnly = store === "newer";
  const status = view?.notifications ?? "unavailable";

  // A change clears the answer to the last action, so the line returns to rest.
  const clearNotice = () => {
    setLine({ kind: "rest" });
    setSavedLine(null);
  };
  const change = (next: SettingsValue) => {
    clearNotice();
    editor.clearLine();
    save(next);
  };
  const withLatest = (patch: Partial<SettingsValue>) => {
    const base = latest();
    if (base) change({ ...base, ...patch });
  };
  // A cadence row's change, and the line that says it was made ("Extra 10 minutes: twice.").
  const changeCadence = (patch: Partial<SettingsValue>, saved: string) => {
    withLatest(patch);
    setSavedLine(saved);
  };
  // A pane's own save line ("Start or pause focus: ⌃⌥G.").
  const say = (text: string) => {
    editor.clearLine();
    setLine({ kind: "rest" });
    setSavedLine(text);
  };

  const openSystemSettings = () => {
    const failed = (error: unknown) => {
      console.error("notifications_open_settings failed", error);
      setOpenFailed(true);
    };
    commands.notificationsOpenSettings().then((result) => {
      if (result.status === "error") failed(result.error);
      else setOpenFailed(false);
    }, failed);
  };

  const failedKeys = line.kind === "failed" ? line.keys : [];
  const reasonIf = (...keys: Key[]) =>
    keys.some((key) => failedKeys.includes(key)) ? WRITE_REASON : undefined;

  const row = notificationsRow(
    status,
    askingFor !== null || shown.notifySessionEnd || shown.notifyTwoMinutes,
    askingFor !== null,
  );
  const notifyLine =
    [
      reasonIf("notify", "notifyTwo"),
      row.line,
      row.action === "open" && openFailed
        ? "Find Orasenda in System Settings, Notifications."
        : undefined,
    ]
      .filter(Boolean)
      .join(" ") || null;

  const notice = buildNotice({
    readOnly,
    line,
    store,
    presets,
    editorLine: editor.line,
    undo: editor.undo,
    savedLine,
    loadFailed: loadError,
    settings,
    latest,
    change,
  });

  return {
    shown,
    store,
    readOnly,
    reason: readOnly ? READ_ONLY : undefined,
    status,
    running: view != null && view.state !== "idle",
    presets,
    presetsFailed,
    editor,
    askingFor,
    ticked,
    row,
    notifyLine,
    notice,
    reasonIf,
    withLatest,
    changeCadence,
    clearNotice,
    say,
    openSystemSettings,
  };
}

export type SettingsModel = ReturnType<typeof useSettingsModel>;
