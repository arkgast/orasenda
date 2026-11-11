import { InlineNotice, type NavPage } from "@orasenda/ui";
import { useEffect, useState } from "react";
import { PagesButton } from "../../app/PagesButton";
import { useShortcuts } from "../../app/useShortcuts";
import { useWindowLayout } from "../../app/useWindowLayout";
import type {
  MilestoneEvent_Serialize,
  MilestoneKind,
  Preset,
  Settings,
  SettingsTarget,
  StartRequest_Deserialize,
  TimerCommandError,
  TimerView_Serialize,
} from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import { latest, load, register, save } from "../../ipc/settingsQueue";
import { useClock } from "../timer/useClock";
import { useTimer } from "../timer/useTimer";
import { Controls } from "./Controls";
import { PresetSummary } from "./PresetSummary";
import { commandFailure, statusLine } from "./statusLine";
import { TimeView } from "./TimeView";
import { useControlFocus } from "./useControlFocus";
import { useNextMinutes } from "./useNextMinutes";
import "./today.css";

// The preset Rust uses when nothing is saved; Start uses it until `settings_get` answers.
const DEFAULT_PRESET: Preset = "classic";

/** One-shot notices; the other milestones (`started`, `paused`, `resumed`) dismiss them. */
const MILESTONE_NOTICES: Partial<Record<MilestoneKind, string>> = {
  ended: "Session ended.",
  recovered: "Your last session ended while Orasenda was closed.",
};

/** A one-shot notice and the session it is about (`null` when the event named none). */
type Notice = { text: string; sessionId: string | null };

type CommandResult =
  | { status: "ok"; data: TimerView_Serialize }
  | { status: "error"; error: TimerCommandError };

function logFailure(name: string) {
  return (error: unknown) => console.error(`${name} failed`, error);
}

type Props = {
  onNavigate(page: NavPage, target?: SettingsTarget): void;
};

/**
 * Today: a grid that fills the window (top, status, time, controls), never scrolling. Every time
 * string comes formatted from Rust. Local state is the one-shot notice, the saved settings, the
 * answers to the last start and the last control, and whether a start is in flight. It always
 * starts with `custom: null`: Rust uses the saved spec.
 */
export function Today({ onNavigate }: Props) {
  const clock = useClock();
  const layout = useWindowLayout();
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useTimer({
    onMilestone: (event: MilestoneEvent_Serialize) => {
      const text = MILESTONE_NOTICES[event.kind];
      setNotice(text ? { text, sessionId: event.sessionId } : null);
    },
  });
  // `settings` is only the saved preset here; the save chain lives in ../settingsQueue.
  const [settings, setSettings] = useState<Settings | null>(null);
  const [starting, setStarting] = useState(false);
  // The start that failed, so Try again repeats it.
  const [failedStart, setFailedStart] = useState<StartRequest_Deserialize | null>(null);
  const [controlError, setControlError] = useState(false);

  useEffect(() => {
    const unregister = register({
      shown: (shown) => setSettings(shown),
      accepted: () => {},
      refused: () => {},
      loadFailed: () => console.error("settings_get failed: Today starts with Classic"),
      // The write is already logged and the store line explains it (spec C).
      saveFailed: () => {},
    });
    load();
    return unregister;
  }, []);

  const view = timer.status === "ok" ? timer.view : null;
  const state = view?.state;

  // A view of another session is a transition this page may not have seen as a milestone (it
  // started elsewhere): it ends the one-shot notice for good. The idle view after an end
  // (`sessionId: null`) keeps it.
  if (notice && view?.sessionId != null && view.sessionId !== notice.sessionId) {
    setNotice(null);
  }

  // The answer to the last action clears on the next view change (spec C, status row).
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    setFailedStart(null);
    setControlError(false);
  }

  const line = statusLine({
    startError: failedStart !== null,
    controlError,
    timerUnavailable: timer.status === "error",
    notice: notice?.text ?? null,
    store: view?.store ?? "ok",
  });
  const focus = useControlFocus(state, line?.text);
  const nextMinutes = useNextMinutes(settings);

  const start = (request: StartRequest_Deserialize) => {
    setStarting(true);
    focus.startRequested();
    commands
      .timerStart(request)
      .then(
        (result) => {
          if (result.status === "ok") {
            setFailedStart(null);
            return;
          }
          focus.cancel();
          console.error("timer_start failed", result.error);
          if (commandFailure(result.error) === "failure") setFailedStart(request);
        },
        (error: unknown) => {
          focus.cancel();
          logFailure("timer_start")(error);
          setFailedStart(request);
        },
      )
      .finally(() => setStarting(false));
  };

  const choosePreset = (preset: Preset) => {
    const current = latest();
    if (current) save({ ...current, preset });
  };

  const startSaved = () => start({ preset: settings?.preset ?? DEFAULT_PRESET, custom: null });
  const startQuick = () => start({ preset: "quick", custom: null });

  const control = (name: string, command: () => Promise<CommandResult>) => {
    command().then(
      (result) => {
        if (result.status === "ok") {
          setControlError(false);
          return;
        }
        focus.cancel();
        console.error(`${name} failed`, result.error);
        if (commandFailure(result.error) === "failure") setControlError(true);
      },
      (error: unknown) => {
        focus.cancel();
        logFailure(name)(error);
        setControlError(true);
      },
    );
  };

  const end = () => {
    focus.endRequested();
    control("timer_stop", commands.timerStop);
  };
  const pauseResume = () =>
    state === "paused"
      ? control("timer_resume", commands.timerResume)
      : control("timer_pause", commands.timerPause);

  const canStart = state === "idle" && !starting;
  const active = state === "running" || state === "paused";
  useShortcuts([
    { key: "Enter", meta: true, when: () => canStart, run: startSaved },
    { key: "Enter", meta: true, shift: true, when: () => canStart, run: startQuick },
    { key: ".", meta: true, when: () => active, run: end },
  ]);

  return (
    <div className="today" data-layout={layout.timer} data-compact={layout.compact || undefined}>
      <h1 className="sr-only" tabIndex={-1}>
        Today
      </h1>

      <div className="today-top">
        <div className="today-top-start">
          {layout.compact ? <PagesButton current="today" onNavigate={onNavigate} /> : null}
        </div>
        <div data-slot="today-summary" className="today-summary">
          <PresetSummary
            state={state ?? "idle"}
            settings={settings}
            session={
              view
                ? { preset: view.preset, plannedMin: view.plannedMin, finish: view.finish }
                : null
            }
            idleFinish={clock.status === "ok" ? clock.idleFinish : null}
            strip={layout.timer !== "ring"}
            onChoose={choosePreset}
            onOpenSettings={() => onNavigate("settings", "timer")}
          />
        </div>
        {/* Reserved for the Focus view button (D). */}
        <div className="today-top-end" />
      </div>

      {/* One live region, always mounted; a new text is a new node, so each line is announced once. */}
      <div className="today-status">
        <InlineNotice
          key={line?.text ?? ""}
          variant="row"
          tone={line?.tone ?? "neutral"}
          actionVariant="quiet"
          actionLabel={line?.action ? "Try again" : undefined}
          actionName="Try again starting focus"
          onAction={line?.action && failedStart ? () => start(failedStart) : undefined}
        >
          {line?.text}
        </InlineNotice>
      </div>

      <div className="today-time">
        <TimeView
          view={view}
          layout={layout.timer}
          clock={clock.status === "ok" ? clock.clock : undefined}
          idleLength={nextMinutes}
        />
      </div>

      <div className="today-controls">
        {view || timer.status === "error" ? (
          <Controls
            state={state ?? "idle"}
            compactStart={layout.timer !== "strip"}
            starting={starting}
            unavailable={timer.status === "error"}
            onStart={startSaved}
            onQuickStart={startQuick}
            onPauseResume={pauseResume}
            onEnd={end}
            boxProps={focus.boxProps}
          />
        ) : null}
      </div>
    </div>
  );
}
