import { FullScreenFocus } from "@orasenda/ui";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useShortcuts } from "../../app/useShortcuts";
import { useTheme } from "../../app/useTheme";
import type { Settings, TimerCommandError, TimerView_Serialize } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import { watchSettingsChanged } from "../../ipc/settingsQueue";
import { useClock } from "../timer/useClock";
import { useSurfaceTimer } from "../timer/useSurfaceTimer";
import { PresetSummary } from "../today/PresetSummary";
import { commandFailure } from "../today/statusLine";
import { useInsets } from "./useInsets";
import "./focus.css";

const UNREADABLE = "Orasenda can't reach the timer. Close this window and try again.";

type Result =
  | { status: "ok"; data: unknown }
  | { status: "error"; error: TimerCommandError | { kind: string; message: string } };

/** The saved settings: one `settings_get`, then every `settings-changed`. */
function useSavedSettings(): { settings: Settings | null; failed: boolean } {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let eventSeen = false;
    const stop = watchSettingsChanged((next) => {
      eventSeen = true;
      setSettings(next);
      setFailed(false);
    });
    commands.settingsGet().then(
      (saved) => {
        if (!cancelled && !eventSeen) setSettings(saved);
      },
      (error: unknown) => {
        console.error("settings_get failed", error);
        if (!cancelled && !eventSeen) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return { settings, failed };
}

/**
 * The full-screen Focus window's page (`focus.html?display=<id>&insets=t,r,b,l`). It only
 * displays the timer (`useSurfaceTimer`: `timer_view`, ticks and the end milestone, never
 * `timer_state`) and sends the commands a person gives it. ⌘↩ starts the saved preset while idle
 * or ended and ⌘. ends a session; Esc opens the leave dialog and only its confirm closes the
 * window. A failed command shows one line in the status row, cleared by the next change of state.
 */
export function FocusPage() {
  useTheme();
  const insets = useInsets();
  const clock = useClock();
  const { view, ended, failed } = useSurfaceTimer();
  const { settings, failed: settingsFailed } = useSavedSettings();
  const [problem, setProblem] = useState<string | null>(null);
  const starting = useRef(false);

  // The answer to the last action clears when the timer changes state (Today does the same).
  const state = view?.state;
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    setProblem(null);
  }

  const run = (name: string, message: string, command: () => Promise<Result>) =>
    command().then(
      (result) => {
        if (result.status === "ok") {
          setProblem(null);
          return true;
        }
        console.error(`${name} failed`, result.error);
        // Another surface got there first: the next view is the truth, so say nothing.
        if (
          "kind" in result.error &&
          commandFailure(result.error as TimerCommandError) === "race"
        ) {
          return false;
        }
        setProblem(message);
        return false;
      },
      (error: unknown) => {
        console.error(`${name} failed`, error);
        setProblem(message);
        return false;
      },
    );

  const idle = state === "idle" || ended;
  const active = state === "running" || state === "paused";
  const start = () => {
    if (starting.current) return;
    starting.current = true;
    run("timer_start", "Focus didn't start. Orasenda's timer isn't responding.", () =>
      commands.timerStart({ quick: false }),
    ).finally(() => {
      starting.current = false;
    });
  };
  const timerCommand = (name: string, command: () => Promise<Result>) => () =>
    void run(name, "Orasenda's timer isn't responding.", command);
  const end = timerCommand("timer_stop", commands.timerStop);
  const pause = timerCommand("timer_pause", commands.timerPause);
  const resume = timerCommand("timer_resume", commands.timerResume);

  useShortcuts([
    { key: "Enter", meta: true, when: () => idle && view !== null, run: start },
    { key: ".", meta: true, when: () => active, run: end },
  ]);

  const choosePreset = (presetId: string) =>
    void run("preset_select", "That preset didn't save.", () => commands.presetSelect(presetId));
  const leave = () =>
    void run("focus_view_close", "This window didn't close.", commands.focusViewClose);

  const shown: TimerView_Serialize | null = view;
  const style = {
    "--focus-inset-top": `${insets.top}px`,
    "--focus-inset-right": `${insets.right}px`,
    "--focus-inset-bottom": `${insets.bottom}px`,
    "--focus-inset-left": `${insets.left}px`,
  } as CSSProperties;

  return (
    <div data-slot="focus-page" className="app-focus-page" style={style}>
      <FullScreenFocus
        remaining={shown?.remaining ?? ""}
        remainingLabel={shown?.remainingLabel ?? ""}
        progress={shown?.progress ?? 0}
        mode={shown?.mode ?? "idle"}
        clock={clock.status === "ok" ? clock.clock : undefined}
        ended={ended}
        status={failed && !view ? UNREADABLE : (problem ?? undefined)}
        singleKeys={false}
        summary={
          idle ? (
            <PresetSummary
              state="idle"
              settings={settings}
              settingsFailed={settingsFailed}
              session={null}
              idleFinish={clock.status === "ok" ? clock.idleFinish : null}
              strip={false}
              onChoose={choosePreset}
            />
          ) : undefined
        }
        onStart={start}
        onPause={pause}
        onResume={resume}
        onEnd={end}
        onExit={leave}
      />
    </div>
  );
}
