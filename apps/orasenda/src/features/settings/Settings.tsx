import { InlineNotice, PageFrame, ScrollRegion, SettingsIndex } from "@orasenda/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Preset, Settings as SettingsValue, Theme } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import { latest, load, register, sameCustom, save } from "../../ipc/settingsQueue";
import { useTimer } from "../timer/useTimer";
import { BREAK_RANGE_HELP, FOCUS_RANGE_HELP, outOfRange, parseMinutes } from "./customRange";
import { askMacOS, isAsking, subscribeAsking, tick, untick } from "./notificationsToggle";
import { About, type AboutInfo } from "./sections/About";
import { AppsAndSites } from "./sections/AppsAndSites";
import { General, themeLabel } from "./sections/General";
import { Notifications, notificationsRow } from "./sections/Notifications";
import { type Draft, type FieldKey, presetLabel, Timer } from "./sections/Timer";

export type SectionId = "general" | "timer" | "notifications" | "appsAndSites" | "about";
export type SettingsTarget = SectionId | "focusMinutes" | "breakMinutes";

/** A visit to the page: a new `seq` is a new arrival (focus moves); `target` says where. */
export type Arrival = { seq: number; target?: SettingsTarget };

const SECTIONS: ReadonlyArray<{ id: SectionId; name: string }> = [
  { id: "general", name: "General" },
  { id: "timer", name: "Timer" },
  { id: "notifications", name: "Notifications" },
  { id: "appsAndSites", name: "Apps and sites" },
  { id: "about", name: "About and data" },
];

// What the page shows until the first settings_get answers (or when the store is unavailable).
const DEFAULT_SETTINGS: SettingsValue = {
  theme: "system",
  preset: "classic",
  custom: { focusMin: 25, breakMin: 5 },
  notifySessionEnd: false,
};

const REST = "Changes save as you make them.";
const WRITE_REASON = "Orasenda can't write its data file.";
const READ_ONLY = "Read-only until you update Orasenda.";

type Key = "theme" | "preset" | "focus" | "break" | "notify";

type Line =
  | { kind: "rest" }
  | { kind: "saved"; text: string }
  | { kind: "fields" }
  | {
      kind: "failed";
      sent: SettingsValue;
      restored: SettingsValue;
      cause: "write" | "unavailable";
      keys: Key[];
    };

const KEY_SECTION: Record<Key, SectionId> = {
  theme: "general",
  preset: "timer",
  focus: "timer",
  break: "timer",
  notify: "notifications",
};

function changedKeys(sent: SettingsValue, restored: SettingsValue): Key[] {
  const keys: Key[] = [];
  if (sent.theme !== restored.theme) keys.push("theme");
  if (sent.preset !== restored.preset) keys.push("preset");
  if (sent.custom.focusMin !== restored.custom.focusMin) keys.push("focus");
  if (sent.custom.breakMin !== restored.custom.breakMin) keys.push("break");
  if (sent.notifySessionEnd !== restored.notifySessionEnd) keys.push("notify");
  return keys;
}

/** `base` with the `keys` taken from `from`. */
function withKeys(base: SettingsValue, from: SettingsValue, keys: Key[]): SettingsValue {
  const next = { ...base, custom: { ...base.custom } };
  for (const key of keys) {
    if (key === "theme") next.theme = from.theme;
    else if (key === "preset") next.preset = from.preset;
    else if (key === "focus") next.custom.focusMin = from.custom.focusMin;
    else if (key === "break") next.custom.breakMin = from.custom.breakMin;
    else next.notifySessionEnd = from.notifySessionEnd;
  }
  return next;
}

const FAILURE_NAME: Record<Key, { subject: string; verb: string; again: string }> = {
  theme: { subject: "Theme", verb: "wasn't", again: "theme" },
  preset: { subject: "Preset", verb: "wasn't", again: "preset" },
  focus: { subject: "Focus minutes", verb: "weren't", again: "focus minutes" },
  break: { subject: "Break minutes", verb: "weren't", again: "break minutes" },
  notify: { subject: "Notifications", verb: "weren't", again: "notifications" },
};

function backTo(key: Key, restored: SettingsValue): string {
  if (key === "theme") return themeLabel(restored.theme);
  if (key === "preset") return presetLabel(restored);
  if (key === "focus") return String(restored.custom.focusMin);
  if (key === "break") return String(restored.custom.breakMin);
  return restored.notifySessionEnd ? "on" : "off";
}

function draftOf(custom: SettingsValue["custom"]): Draft {
  return { focus: String(custom.focusMin), break: String(custom.breakMin) };
}

const noop = () => {};

export function Settings({ info, arrival }: { info: AboutInfo; arrival: Arrival }) {
  const root = useRef<HTMLDivElement>(null);
  const timer = useTimer({ onMilestone: noop });
  const view = timer.status === "ok" ? timer.view : null;
  const [settings, setSettings] = useState<SettingsValue | null>(null);
  const [draft, setDraft] = useState<Draft>({
    focus: String(DEFAULT_SETTINGS.custom.focusMin),
    break: String(DEFAULT_SETTINGS.custom.breakMin),
  });
  const [fieldErr, setFieldErr] = useState<{ focus: boolean; break: boolean }>({
    focus: false,
    break: false,
  });
  const [line, setLine] = useState<Line>({ kind: "rest" });
  const [loadError, setLoadError] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const [current, setCurrent] = useState<SectionId>("general");
  const asking = useSyncExternalStore(subscribeAsking, isAsking);
  // The minutes a field save in flight carries, for the "Saved." line.
  const pendingSaved = useRef<{
    focus: boolean;
    break: boolean;
    custom: SettingsValue["custom"];
  } | null>(null);
  const shownCustom = useRef<SettingsValue["custom"] | null>(null);

  useEffect(() => {
    const unregister = register({
      shown: (shown, resetDraft) => {
        setLoadError(false);
        setSettings(shown);
        // The draft follows only when the saved minutes changed: a reload for another setting
        // (a theme change from the menu bar) never overwrites text being typed.
        if (
          resetDraft &&
          (!shownCustom.current || !sameCustom(shownCustom.current, shown.custom))
        ) {
          setDraft(draftOf(shown.custom));
        }
        shownCustom.current = shown.custom;
      },
      accepted: () => {
        const sent = pendingSaved.current;
        if (!sent) return;
        pendingSaved.current = null;
        setFieldErr({ focus: false, break: false });
        const parts: string[] = [];
        if (sent.focus) parts.push(`Custom focus is now ${sent.custom.focusMin} minutes.`);
        if (sent.break) parts.push(`Custom break is now ${sent.custom.breakMin} minutes.`);
        setLine({ kind: "saved", text: `Saved. ${parts.join(" ")}` });
      },
      refused: (custom) => {
        pendingSaved.current = null;
        // The queue has put the saved minutes back as the intent; the draft stays as typed.
        const intent = latest();
        if (intent) setSettings(intent);
        const range = outOfRange(custom);
        setFieldErr(range.focus || range.break ? range : { focus: true, break: true });
        setLine({ kind: "fields" });
      },
      loadFailed: () => setLoadError(true),
      saveFailed: (sent, restored, cause) => {
        pendingSaved.current = null;
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
    } else if (target === "focusMinutes" || target === "breakMinutes") {
      const field = document.getElementById(target);
      field?.scrollIntoView?.({ block: "nearest" });
      field?.focus();
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
    pendingSaved.current = null;
    setLine({ kind: "rest" });
    save(next);
  };
  const withLatest = (patch: Partial<SettingsValue>) => {
    const base = latest();
    if (base) change({ ...base, ...patch });
  };

  const commit = () => {
    const base = latest();
    if (!base) return;
    const focusMin = parseMinutes(draft.focus);
    const breakMin = parseMinutes(draft.break);
    const focusOk = focusMin !== null;
    const breakOk = breakMin !== null;
    const savedDraft = draftOf(base.custom);
    const bad = {
      focus: !focusOk && draft.focus !== savedDraft.focus,
      break: !breakOk && draft.break !== savedDraft.break,
    };
    if (bad.focus || bad.break) {
      setFieldErr(bad);
      setLine({ kind: "fields" });
      return;
    }
    if (focusMin === null || breakMin === null) return;
    const custom = { focusMin, breakMin };
    if (sameCustom(custom, base.custom)) {
      setFieldErr({ focus: false, break: false });
      setLine((previous) => (previous.kind === "fields" ? { kind: "rest" } : previous));
      return;
    }
    change({ ...base, custom });
    pendingSaved.current = {
      focus: custom.focusMin !== base.custom.focusMin,
      break: custom.breakMin !== base.custom.breakMin,
      custom,
    };
  };

  const restore = (key: FieldKey) => {
    const base = latest() ?? shown;
    const saved = draftOf(base.custom);
    setDraft((previous) => ({ ...previous, [key]: saved[key] }));
    const other: FieldKey = key === "focus" ? "break" : "focus";
    setFieldErr((previous) => ({ ...previous, [key]: false }));
    // The other field's error, its save line and its Show action stay while it still shows.
    setLine((previous) =>
      previous.kind === "fields" && !fieldErr[other] ? { kind: "rest" } : previous,
    );
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
  const saved = shown.custom;
  const fieldsText = (() => {
    if (fieldErr.focus && fieldErr.break)
      return `Focus and break minutes weren't saved. Still using ${saved.focusMin} and ${saved.breakMin}.`;
    if (fieldErr.focus) return `Focus minutes weren't saved. Still using ${saved.focusMin}.`;
    if (fieldErr.break) return `Break minutes weren't saved. Still using ${saved.breakMin}.`;
    return null;
  })();
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
    if (line.kind === "fields" && fieldsText) {
      return {
        text: fieldsText,
        tone: "attention",
        action: {
          label: "Show",
          name: fieldErr.focus ? "Show focus minutes" : "Show break minutes",
          run: () =>
            document.getElementById(fieldErr.focus ? "focusMinutes" : "breakMinutes")?.focus(),
        },
      };
    }
    if (line.kind === "failed") {
      const resend = () => {
        const base = latest();
        if (!base) return;
        const next = withKeys(base, line.sent, line.keys);
        const customKeys = line.keys.filter((key) => key === "focus" || key === "break");
        change(next);
        if (customKeys.length > 0) {
          pendingSaved.current = {
            focus: customKeys.includes("focus"),
            break: customKeys.includes("break"),
            custom: next.custom,
          };
        }
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
          text: `${name.subject} ${name.verb} saved. Back to ${backTo(only, line.restored)}.`,
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
    if (line.kind === "saved") return { text: line.text, tone: "neutral" };
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

  const row = notificationsRow(status, asking || shown.notifySessionEnd, asking);
  const notifyLine =
    [
      reasonIf("notify"),
      row.line,
      row.action === "open" && openFailed
        ? "Find Orasenda in System Settings, Notifications."
        : undefined,
    ]
      .filter(Boolean)
      .join(" ") || null;

  const errors = {
    focus: fieldErr.focus ? `${FOCUS_RANGE_HELP} Still using ${saved.focusMin}.` : undefined,
    break: fieldErr.break ? `${BREAK_RANGE_HELP} Still using ${saved.breakMin}.` : undefined,
  };

  const problem = (id: SectionId): { text: string } | undefined => {
    if (failedKeys.some((key) => KEY_SECTION[key] === id)) return { text: "Not saved" };
    if (id === "timer" && fieldErr.focus) return { text: "Check focus minutes" };
    if (id === "timer" && fieldErr.break) return { text: "Check break minutes" };
    return undefined;
  };
  const values: Record<SectionId, string> = {
    general: themeLabel(shown.theme),
    timer: presetLabel(shown),
    notifications: row.value,
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
        <div className="settings-body">
          <SettingsIndex
            sections={sections}
            current={current}
            onJump={(id) => jump(id as SectionId)}
          />
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
                draft={draft}
                errors={errors}
                running={running}
                disabled={readOnly}
                disabledReason={reason}
                presetStatus={reasonIf("preset")}
                customStatus={reasonIf("focus", "break")}
                onPreset={(preset: Preset) => withLatest({ preset })}
                onDraft={(key, value) => setDraft((previous) => ({ ...previous, [key]: value }))}
                onCommit={commit}
                onRestore={restore}
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
                  if (checked) tick(status);
                  else untick();
                }}
                onAsk={askMacOS}
                onOpen={openSystemSettings}
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
