import { cadenceActions } from "@domain/cadence/cadenceActions";
import { FIXED_KEYS, singleKeyName } from "@domain/keyboard/bindings";
import { useBindings } from "@domain/keyboard/useBindings";
import { useShortcuts } from "@domain/keyboard/useShortcuts";
import { useSingleKeys } from "@domain/keyboard/useSingleKeys";
import { PresetSummary } from "@domain/presets/PresetSummary";
import { selectedPreset, usePresets } from "@domain/presets/presets";
import { commandFailure } from "@domain/timer/commandFailure";
import { useClock } from "@domain/timer/useClock";
import { useSurfaceTimer } from "@domain/timer/useSurfaceTimer";
import { FullScreenFocus } from "@orasenda/ui";
import { useTheme } from "@shared/hooks/useTheme";
import type { Settings, TimerCommandError, TimerView_Serialize } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { watchSettingsChanged } from "@shared/ipc/settingsQueue";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { hintText, useEntryHint } from "./keyHint";
import { useInsets } from "./useInsets";
import { useLeaveKey } from "./useLeaveKey";
import "./focus.css";

const isRace = (error: TimerCommandError) => commandFailure(error) === "race";
const UNREADABLE = "Orasenda can't reach the timer. Try again in a moment.";

type Result<E extends { kind: string }> =
  | { status: "ok"; data: unknown }
  | { status: "error"; error: E };

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
 * `main`'s full-screen view (ADR-019): the page App renders in place of the rail and the page
 * while `main` is in native full screen. It only displays the timer (`useSurfaceTimer`:
 * `timer_view`, ticks and the end milestone, never `timer_state`) and sends the commands a person
 * gives it. ⌘↩ starts the saved preset while idle or ended and ⌘. ends a session, and Space
 * starts, pauses or resumes while the single-key setting is on. Esc and the Leave button leave at
 * once (`full_screen_leave`, no dialog); an open overlay takes Esc first. `hintsLeft` is the
 * count Rust took at this entry's start: the key hint shows for `duration-hint` while it is above
 * 0. A failed command shows one line in the status row, cleared by the next change of state.
 */
export function FocusPage({ hintsLeft = 0 }: { hintsLeft?: number }) {
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

  const run = <E extends { kind: string }>(
    name: string,
    message: string,
    command: () => Promise<Result<E>>,
    isRace: (error: E) => boolean = () => false,
  ) =>
    command().then(
      (result) => {
        if (result.status === "ok") {
          setProblem(null);
          return true;
        }
        console.error(`${name} failed`, result.error);
        // Another surface got there first: the next view is the truth, so say nothing.
        if (isRace(result.error)) return false;
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
    run(
      "timer_start",
      "Focus didn't start. Orasenda's timer isn't responding.",
      () => commands.timerStart({ quick: false }),
      isRace,
    ).finally(() => {
      starting.current = false;
    });
  };
  const timerCommand = (name: string, command: () => Promise<Result<TimerCommandError>>) => () =>
    void run(name, "Orasenda's timer isn't responding.", command, isRace);
  const end = timerCommand("timer_stop", commands.timerStop);
  const pause = timerCommand("timer_pause", commands.timerPause);
  const resume = timerCommand("timer_resume", commands.timerResume);
  const extend = timerCommand("timer_extend", commands.timerExtend);
  const takeBreak = timerCommand("timer_take_break", commands.timerTakeBreak);
  const dismissOffer = timerCommand("timer_dismiss_offer", commands.timerDismissOffer);
  const presets = usePresets();
  const actions = cadenceActions(
    view,
    {
      extend,
      takeBreak,
      // Skip break is End: the same command Today's button sends.
      skipBreak: end,
      keepGoing: start,
      stopHere: dismissOffer,
    },
    selectedPreset(presets, settings)?.name ?? null,
  );

  useShortcuts([
    { key: "Enter", meta: true, when: () => idle && view !== null, run: start },
    { key: ".", meta: true, when: () => active, run: end },
  ]);

  const singleKeys = settings?.singleKey === true;
  const toggle = () => {
    if (idle && view !== null) start();
    else if (state === "running") pause();
    else if (state === "paused") resume();
  };
  const bindings = useBindings();
  const space = singleKeyName(bindings.byId("startPause"));
  useSingleKeys(space ? { [space]: toggle } : {}, singleKeys);

  const choosePreset = (presetId: string) =>
    void run(
      "preset_select",
      "That preset didn't save.",
      () => commands.presetSelect(presetId),
      isRace,
    );
  const leave = () =>
    void run(
      "full_screen_leave",
      "Orasenda couldn't leave full screen. Try again.",
      commands.fullScreenLeave,
    );
  useLeaveKey(leave);
  const showHint = useEntryHint(hintsLeft);
  const { fixedHint } = bindings;
  const hint = {
    text: hintText({
      singleKeys,
      idle,
      paused: state === "paused",
      start: fixedHint(FIXED_KEYS.start),
      end: fixedHint(FIXED_KEYS.end),
    }),
    visible: showHint,
  };

  const shown: TimerView_Serialize | null = view;
  const style = {
    "--focus-inset-top": `${insets.top}px`,
    "--focus-inset-right": `${insets.right}px`,
    "--focus-inset-bottom": `${insets.bottom}px`,
    "--focus-inset-left": `${insets.left}px`,
  } as CSSProperties;

  return (
    <main
      data-slot="focus-page"
      aria-label="Focus session"
      className="app-focus-page"
      style={style}
    >
      <FullScreenFocus
        remaining={shown?.remaining ?? ""}
        remainingLabel={shown?.remainingLabel ?? ""}
        progress={shown?.progress ?? 0}
        mode={shown?.mode ?? "idle"}
        phase={shown?.phase ?? "focus"}
        offer={shown?.state === "idle" && shown.offer === "keepGoing"}
        secondaryActions={actions}
        clock={clock.status === "ok" ? clock.clock : undefined}
        ended={ended}
        status={failed && !view ? UNREADABLE : (problem ?? undefined)}
        singleKeys={singleKeys}
        hint={hint}
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
        onLeave={leave}
      />
    </main>
  );
}
