import type { NavPage } from "@orasenda/ui";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import type {
  FocusViewTarget,
  MilestoneEvent_Serialize,
  Settings,
  SettingsTarget,
  StartRequest,
  TimerCommandError,
  TimerView_Serialize,
} from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { latest, load, register, save } from "@shared/ipc/settingsQueue";
import { useEffect, useRef, useState } from "react";
import { PagesButton } from "../../app/PagesButton";
import { useShortcuts } from "../../app/useShortcuts";
import { useClock } from "../timer/useClock";
import { useTimer } from "../timer/useTimer";
import { Controls } from "./Controls";
import { FocusViewButton } from "./FocusViewButton";
import { openFocusView } from "./focusView";
import { type IntentDone, IntentField } from "./IntentField";
import { claimIntentRequest, onIntentFieldRequest } from "./intentEvents";
import { type Notice, noticeAfter } from "./notices";
import { PresetSummary } from "./PresetSummary";
import { selectedPreset, usePresets } from "./presets";
import { StatusRow } from "./StatusRow";
import { commandFailure, type StatusActionId, statusLine } from "./statusLine";
import { TimeView } from "./TimeView";
import { useTodayKeys } from "./todayKeys";
import { useControlFocus } from "./useControlFocus";
import { useKeepGoingHint, usePageVisible } from "./useKeepGoingHint";
import { useNextMinutes } from "./useNextMinutes";
import { useTipShown, useTips } from "./useTips";
import "./today.css";

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
 * answers to the last start and the last control, and whether a start is in flight. A start sends
 * `{ quick }` only: Rust starts the selected preset, or the two-minute one.
 */
export function Today({ onNavigate }: Props) {
  const clock = useClock();
  const layout = useWindowLayout();
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useTimer({
    onMilestone: (event: MilestoneEvent_Serialize) => {
      const hours = latest()?.deepCapHours ?? 4;
      setNotice((previous) => noticeAfter(previous, event, hours));
      // The newest one-shot line wins: a milestone ends the failed-open line.
      setFailedOpen(null);
    },
  });
  // `settings` is only the saved preset here; the save chain lives in ../settingsQueue.
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  // The start that failed, so Try again repeats it.
  const [failedStart, setFailedStart] = useState<StartRequest | null>(null);
  const [controlError, setControlError] = useState(false);
  // The focus view that failed to open, so Try again repeats it.
  const [failedOpen, setFailedOpen] = useState<FocusViewTarget | null>(null);

  useEffect(() => {
    const unregister = register({
      shown: (shown) => {
        setSettings(shown);
        setSettingsFailed(false);
      },
      accepted: () => {},
      loadFailed: () => {
        console.error("settings_get failed: Today starts with the selected preset");
        setSettingsFailed(true);
      },
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
  if (notice && !notice.persist && view?.sessionId != null && view.sessionId !== notice.sessionId) {
    setNotice(null);
  }

  // The answer to the last action clears on the next view change (spec C, status row).
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    setFailedStart(null);
    setControlError(false);
    setFailedOpen(null);
  }

  const presets = usePresets();
  const inBreak = view !== null && view.state !== "idle" && view.phase === "break";
  const canEditIntent = view !== null && view.state !== "idle" && view.phase === "focus";
  const [editingIntent, setEditingIntent] = useState(false);
  if (editingIntent && !canEditIntent) setEditingIntent(false);
  const visible = usePageVisible();
  const [hintShownLine, setHintShownLine] = useState(false);
  const hintDue = useKeepGoingHint(view, hintShownLine);
  const tips = useTips(view);
  const line = statusLine({
    hint: hintDue,
    tip: tips.tip,
    welcome: tips.welcome,
    startError: failedStart !== null,
    controlError,
    openFailed: failedOpen !== null,
    timerUnavailable: timer.status === "error",
    notice: notice?.text ?? null,
    store: view?.store ?? "ok",
    cadence: view,
    capNotice: notice?.persist === true,
    stacked: layout.timer === "stackedStrip",
    strip: layout.timer === "strip",
    keepGoingPreset: selectedPreset(presets, settings)?.name ?? null,
  });
  const hintOnScreen =
    visible && !editingIntent && (line?.actions.some((a) => a.id === "openSettings") ?? false);
  if (hintOnScreen !== hintShownLine) setHintShownLine(hintOnScreen);
  useTipShown(line?.tipId ?? null, visible && !editingIntent);
  const focus = useControlFocus(state, line?.text);
  const nextMinutes = useNextMinutes(settings);

  // The intent field: only the person opens it, and only while a focus runs or is paused.
  const canEditRef = useRef(canEditIntent);
  canEditRef.current = canEditIntent;
  useEffect(
    () =>
      onIntentFieldRequest(() => {
        if (!canEditRef.current) return false;
        setEditingIntent(true);
        return true;
      }),
    [],
  );
  // A request that arrived before the timer's first reply is held; take it once editing is possible.
  useEffect(() => {
    if (canEditIntent && claimIntentRequest()) setEditingIntent(true);
  }, [canEditIntent]);
  const statusBox = useRef<HTMLDivElement>(null);
  const refocusStatus = useRef(false);
  useEffect(() => {
    if (editingIntent || !refocusStatus.current) return;
    refocusStatus.current = false;
    statusBox.current?.querySelector("button")?.focus();
  }, [editingIntent]);

  const start = (request: StartRequest) => {
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

  const openView = (target: FocusViewTarget) => {
    openFocusView(target).then((opened) => setFailedOpen(opened ? null : target));
  };

  const choosePreset = (presetId: string) => {
    const current = latest();
    if (current) save({ ...current, presetId });
  };

  const startSaved = () => start({ quick: false });
  const startQuick = () => start({ quick: true });

  const control = (name: string, command: () => Promise<CommandResult>, onOk?: () => void) => {
    command().then(
      (result) => {
        if (result.status === "ok") {
          setControlError(false);
          onOk?.();
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

  const intentDone = ({ save, refocus }: IntentDone) => {
    refocusStatus.current = refocus;
    setEditingIntent(false);
    if (save !== undefined) control("timer_set_intent", () => commands.timerSetIntent(save));
  };

  const onAction = (id: StatusActionId) => {
    switch (id) {
      case "tryAgain":
        if (failedStart) start(failedStart);
        break;
      case "tryAgainOpen":
        if (failedOpen) openView(failedOpen);
        break;
      case "extend":
        focus.startRequested();
        control("timer_extend", commands.timerExtend);
        break;
      case "takeBreak":
        focus.startRequested();
        control("timer_take_break", commands.timerTakeBreak);
        break;
      case "skipBreak":
        end();
        break;
      case "keepGoing":
        startSaved();
        break;
      case "stopHere":
        control("timer_dismiss_offer", commands.timerDismissOffer, focus.focusStart);
        break;
      case "intent":
        setEditingIntent(true);
        break;
      case "gotIt":
        tips.gotIt();
        focus.focusStart();
        break;
      case "openSettings":
        onNavigate("settings", "keepGoing");
        break;
    }
  };

  const canStart = state === "idle" && !starting;
  const active = state === "running" || state === "paused";
  const singleKeys = settings?.singleKey === true;
  const keys = useTodayKeys({
    enabled: singleKeys,
    canStart,
    active,
    start: startSaved,
    pauseResume,
  });
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
            settingsFailed={settingsFailed}
            session={
              view
                ? {
                    presetId: view.presetId,
                    presetName: view.presetName,
                    quick: view.quick,
                    breakKind: view.state === "idle" ? null : view.breakKind,
                    breakMin: view.breakMin,
                    plannedMin: view.plannedMin,
                    finish: view.finish,
                  }
                : null
            }
            idleFinish={clock.status === "ok" ? clock.idleFinish : null}
            strip={layout.timer !== "ring"}
            singleKeys={singleKeys}
            openRequest={keys.presetRequest}
            onChoose={choosePreset}
            onOpenSettings={() => onNavigate("settings", "timer")}
          />
        </div>
        <div className="today-top-end">
          <FocusViewButton
            onOpen={openView}
            singleKeys={singleKeys}
            openRequest={keys.viewRequest}
          />
        </div>
      </div>

      {/* One live region, always mounted; a new text is a new node, so each line is announced once. */}
      <div className="today-status" ref={statusBox}>
        {editingIntent ? (
          <IntentField value={view?.intent ?? null} onDone={intentDone} />
        ) : (
          <StatusRow line={line} onAction={onAction} />
        )}
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
            inBreak={inBreak}
            compactStart={layout.timer !== "strip"}
            starting={starting}
            unavailable={timer.status === "error"}
            singleKeys={singleKeys}
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
