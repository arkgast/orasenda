import { InlineNotice, type NavPage, PageFrame, ScrollRegion, SettingsIndex } from "@orasenda/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWindowLayout } from "../../app/useWindowLayout";
import type { Settings as SettingsValue, Theme } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import { latest, load, register, save } from "../../ipc/settingsQueue";
import { useTimer } from "../timer/useTimer";
import { selectedPreset, usePresets, usePresetsFailed } from "../today/presets";
import { askingKey, askMacOS, subscribeAsking, tick, untick } from "./notificationsToggle";
import {
  type Arrival,
  SECTIONS,
  type SectionId,
  SettingsPicker,
  type SettingsTarget,
} from "./SettingsHeader";
import { About, type AboutInfo } from "./sections/About";
import { AppsAndSites } from "./sections/AppsAndSites";
import { General, themeLabel } from "./sections/General";
import { Keyboard } from "./sections/Keyboard";
import { Notifications, notificationsRow } from "./sections/Notifications";
import { presetLabel, Timer } from "./sections/Timer";
import { backTo, changedKeys, FAILURE_NAME, KEY_SECTION, type Key, withKeys } from "./settingsKeys";
import { focusKeepGoing } from "./settingsTarget";
import { usePresetEditing } from "./usePresets";

export type { Arrival, SectionId, SettingsTarget };

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
  startPauseKeys: "Control+Alt+KeyF",
  captureKeys: "Control+Alt+KeyN",
  singleKey: true,
};

const REST = "Changes save as you make them.";
const WRITE_REASON = "Orasenda can't write its data file.";
const READ_ONLY = "Read-only until you update Orasenda.";

type Line =
  | { kind: "rest" }
  | {
      kind: "failed";
      sent: SettingsValue;
      restored: SettingsValue;
      cause: "write" | "unavailable";
      keys: Key[];
    };

const noop = () => {};

export function Settings({
  info,
  arrival,
  onNavigate,
}: {
  info: AboutInfo;
  arrival: Arrival;
  onNavigate(page: NavPage): void;
}) {
  const { compact } = useWindowLayout();
  const root = useRef<HTMLDivElement>(null);
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
  const [current, setCurrent] = useState<SectionId>("general");
  const askingFor = useSyncExternalStore(subscribeAsking, askingKey);
  const asking = askingFor === "notifySessionEnd";
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

  // Arrival: the h1 (or the target) takes focus on each visit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new arrival is the trigger.
  useEffect(() => {
    const target = arrival.target;
    const node = root.current;
    if (!node) return;
    if (!target) {
      node.querySelector<HTMLElement>("h1")?.focus();
    } else if (target === "keepGoing") {
      if (!focusKeepGoing(node)) jump("timer");
    } else if (target === "focusMinutes" || target === "breakMinutes") {
      // The length fields moved into the preset editor; the Timer section is the closest place.
      jump("timer");
    } else {
      jump(target);
    }
  }, [arrival.seq]);

  // `current` follows the scroll: the last heading at or above the region's top edge.
  useEffect(() => {
    const region = root.current?.querySelector<HTMLElement>('[role="region"]');
    if (!region || typeof IntersectionObserver === "undefined") return;
    const headings = SECTIONS.map(({ id }) =>
      root.current?.querySelector<HTMLElement>(`#settings-${id}-heading`),
    );
    const compute = () => {
      const top = region.getBoundingClientRect().top;
      let found: SectionId = SECTIONS[0]?.id ?? "general";
      SECTIONS.forEach(({ id }, index) => {
        const heading = headings[index];
        if (heading && heading.getBoundingClientRect().top <= top + 1) found = id;
      });
      setCurrent(found);
    };
    const observer = new IntersectionObserver(compute, { root: region, threshold: [0, 1] });
    for (const heading of headings) if (heading) observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  function jump(id: SectionId) {
    const heading = root.current?.querySelector<HTMLElement>(`#settings-${id}-heading`);
    if (!heading) return;
    setCurrent(id);
    heading.scrollIntoView?.({ block: "start" });
    heading.focus({ preventScroll: true });
  }

  const shown = settings ?? DEFAULT_SETTINGS;
  const store = view?.store ?? "ok";
  const readOnly = store === "newer";
  const reason = readOnly ? READ_ONLY : undefined;
  const status = view?.notifications ?? "unavailable";
  const running = view != null && view.state !== "idle";

  // A change clears the answer to the last action, so the line returns to rest.
  const change = (next: SettingsValue) => {
    setLine({ kind: "rest" });
    setSavedLine(null);
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

  // Save line.
  type Notice = {
    text: string;
    tone: "neutral" | "attention" | "rest";
    action?: { label: string; name: string; run: () => void };
  };
  const notice = ((): Notice => {
    if (readOnly) {
      return {
        text: "This data was saved by a newer Orasenda. Settings are read-only until you update.",
        tone: "attention",
      };
    }
    if (line.kind === "failed") {
      const resend = () => {
        const base = latest();
        if (!base) return;
        change(withKeys(base, line.sent, line.keys));
      };
      if (store === "unavailable" && line.cause === "unavailable") {
        return {
          text: "Orasenda can't save settings right now. Changes you make here may not be kept.",
          tone: "attention",
          action: { label: "Try again", name: "Try again saving", run: resend },
        };
      }
      const [only, ...more] = line.keys;
      if (only && more.length === 0) {
        const name = FAILURE_NAME[only];
        return {
          text: `${name.subject} ${name.verb} saved. Back to ${backTo(only, line.restored, presets)}.`,
          tone: "attention",
          action: { label: "Try again", name: `Try again saving ${name.again}`, run: resend },
        };
      }
      return {
        text: "Your last changes weren't saved. Settings are back to what was saved.",
        tone: "attention",
        action: { label: "Try again", name: "Try again saving your changes", run: resend },
      };
    }
    if (editor.line) {
      const { text, undo, retry } = editor.line;
      const action = undo
        ? {
            label: "Undo",
            name: `Undo removing ${undo.name}`,
            run: () => editor.undo(undo.id, undo.name),
          }
        : retry
          ? { label: "Try again", name: "Try again", run: retry }
          : undefined;
      return { text, tone: retry ? "attention" : "neutral", action };
    }
    if (savedLine) return { text: savedLine, tone: "neutral" };
    if (loadError && !settings) {
      return { text: "Orasenda can't read settings right now.", tone: "attention" };
    }
    if (store === "unavailable") {
      return {
        text: "Orasenda can't save settings right now. Changes you make here may not be kept.",
        tone: "attention",
      };
    }
    return { text: REST, tone: "rest" };
  })();

  const failedKeys = line.kind === "failed" ? line.keys : [];
  const failedIn = (...keys: Key[]) => keys.some((key) => failedKeys.includes(key));
  const reasonIf = (...keys: Key[]) => (failedIn(...keys) ? WRITE_REASON : undefined);

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

  const problem = (id: SectionId): { text: string } | undefined => {
    if (failedKeys.some((key) => KEY_SECTION[key] === id)) return { text: "Not saved" };
    return undefined;
  };
  const values: Record<SectionId, string> = {
    general: themeLabel(shown.theme),
    timer: presetLabel(presets, shown),
    notifications: row.value,
    keyboard: shown.singleKey ? "Single keys on" : "Single keys off",
    appsAndSites: "Nothing recorded",
    about:
      info.status === "ok"
        ? `Version ${info.info.version}`
        : info.status === "error"
          ? "Version unavailable"
          : "",
  };
  const sections = SECTIONS.map(({ id, name }) => ({
    id,
    name,
    value: values[id],
    problem: problem(id),
  }));

  return (
    <div ref={root} className="settings-page">
      <PageFrame
        title="Settings"
        compactPicker={
          compact ? (
            <SettingsPicker
              page="settings"
              onNavigate={onNavigate}
              current={current}
              onJump={jump}
            />
          ) : undefined
        }
        status={
          <InlineNotice
            variant="row"
            tone={notice.tone}
            actionLabel={notice.action?.label}
            actionName={notice.action?.name}
            onAction={notice.action?.run}
          >
            {notice.text}
          </InlineNotice>
        }
      >
        <div className={compact ? "settings-body settings-body-compact" : "settings-body"}>
          {compact ? null : (
            <SettingsIndex
              sections={sections}
              current={current}
              onJump={(id) => jump(id as SectionId)}
            />
          )}
          <ScrollRegion label="Settings">
            <div className="settings-content">
              <General
                theme={shown.theme}
                disabled={readOnly}
                disabledReason={reason}
                status={reasonIf("theme")}
                onChange={(theme: Theme) => withLatest({ theme })}
              />
              <Timer
                settings={shown}
                presets={presets}
                presetsFailed={presetsFailed}
                running={running}
                disabled={readOnly}
                editLocked={readOnly || store === "unavailable"}
                disabledReason={reason}
                presetStatus={reasonIf("preset")}
                cadenceStatus={reasonIf("cadence")}
                editor={editor}
                onPreset={(presetId: string) => withLatest({ presetId })}
                onCadence={changeCadence}
              />
              <Notifications
                checked={asking || shown.notifySessionEnd}
                asking={asking}
                disabled={readOnly || status === "unavailable"}
                disabledReason={reason}
                line={notifyLine}
                action={row.action}
                onToggle={(checked) => {
                  setLine({ kind: "rest" });
                  setSavedLine(null);
                  if (checked) tick(status);
                  else untick();
                }}
                twoMinutes={askingFor === "notifyTwoMinutes" || shown.notifyTwoMinutes}
                twoMinutesAsking={askingFor === "notifyTwoMinutes"}
                onTwoMinutes={(checked) => {
                  setLine({ kind: "rest" });
                  setSavedLine(null);
                  if (checked) tick(status, "notifyTwoMinutes");
                  else untick("notifyTwoMinutes");
                }}
                onAsk={askMacOS}
                onOpen={openSystemSettings}
              />
              <Keyboard
                singleKey={shown.singleKey}
                disabled={readOnly}
                disabledReason={reason}
                status={reasonIf("singleKey")}
                onSingleKey={(singleKey) =>
                  changeCadence({ singleKey }, `Single-key shortcuts: ${singleKey ? "on" : "off"}.`)
                }
                onSaved={(text) => {
                  editor.clearLine();
                  setLine({ kind: "rest" });
                  setSavedLine(text);
                }}
              />
              <AppsAndSites />
              <About info={info} />
            </div>
          </ScrollRegion>
        </div>
      </PageFrame>
    </div>
  );
}
