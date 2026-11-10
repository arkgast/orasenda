import { Button, InlineNotice, Input, ModeChip, StartButton, TimerRing } from "@orasenda/ui";
import { useEffect, useId, useState } from "react";
import type {
  CustomSpec,
  MilestoneEvent_Serialize,
  MilestoneKind,
  Preset,
  Settings,
  StartRequest_Deserialize,
  StoreStatus,
  TimerCommandError,
  TimerView_Serialize,
} from "../bindings";
import { commands } from "../bindings";
import { BREAK_RANGE, BREAK_RANGE_HELP, FOCUS_RANGE, FOCUS_RANGE_HELP } from "../customRange";
import { latest, load, register, sameCustom, save } from "../settingsQueue";
import { DevPanel } from "../spike/DevPanel";
import { useClock } from "../useClock";
import { useTimer } from "../useTimer";

const PRESETS: ReadonlyArray<{ preset: Preset; label: string }> = [
  { preset: "classic", label: "Classic 25/5" },
  { preset: "fifty_ten", label: "50/10" },
  { preset: "deep_block", label: "Deep Block 90" },
  { preset: "custom", label: "Custom" },
];

// The preset Rust uses when nothing is saved; Start uses it until `settings_get` answers.
const DEFAULT_PRESET: Preset = "classic";

type RangeHelp = { focus: boolean; break: boolean };
const NO_RANGE_HELP: RangeHelp = { focus: false, break: false };

const EXPLANATION = "Orasenda can tell you when a session ends, even when its window is hidden.";

/** One-shot notices; the other milestones (`started`, `paused`, `resumed`) dismiss them. */
const MILESTONE_NOTICES: Partial<Record<MilestoneKind, string>> = {
  ended: "Session ended.",
  recovered: "Your last session ended while Orasenda was closed.",
};

const STORE_LINES: Readonly<Record<Exclude<StoreStatus, "ok">, string>> = {
  unavailable: "Orasenda can't save sessions right now.",
  newer: "This data was saved by a newer Orasenda.",
};

/** A one-shot notice and the session it is about (`null` when the event named none). */
type Notice = { text: string; sessionId: string | null };

/** The Custom fields as typed: committed on blur or Enter, never per keystroke. */
type Draft = { focus: string; break: string };

function draftOf(custom: CustomSpec): Draft {
  return { focus: String(custom.focusMin), break: String(custom.breakMin) };
}

/** The draft as minutes when both fields are whole numbers; the range is Rust's to check. */
function parseDraft(draft: Draft): CustomSpec | null {
  if (!/^\d+$/.test(draft.focus) || !/^\d+$/.test(draft.break)) return null;
  return { focusMin: Number(draft.focus), breakMin: Number(draft.break) };
}

/**
 * The helpers to show for a refused spec. When neither field is out of range locally (no spec
 * was sent, or the bounds drifted from core's), both show so the refusal is never silent.
 */
function rangeHelpFor(custom: CustomSpec | null | undefined): RangeHelp {
  if (!custom) return { focus: true, break: true };
  const focus = custom.focusMin < FOCUS_RANGE.min || custom.focusMin > FOCUS_RANGE.max;
  const brk = custom.breakMin < BREAK_RANGE.min || custom.breakMin > BREAK_RANGE.max;
  return focus || brk ? { focus, break: brk } : { focus: true, break: true };
}

function logFailure(name: string) {
  return (error: unknown) => console.error(`${name} failed`, error);
}

/**
 * Today: the ring, the mode, the preset choice and the one primary action. Every time string on
 * it comes formatted from Rust (the view or the clock tick); the only local state is the
 * one-shot notice, the saved settings, the Custom drafts and which range helpers show.
 */
export function Today() {
  const clock = useClock();
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useTimer({
    onMilestone: (event: MilestoneEvent_Serialize) => {
      const text = MILESTONE_NOTICES[event.kind];
      setNotice(text ? { text, sessionId: event.sessionId } : null);
    },
  });
  // `settings` is what the page shows; the save chain lives in ../settingsQueue.
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [draft, setDraft] = useState<Draft>({ focus: "", break: "" });
  const [rangeHelp, setRangeHelp] = useState<RangeHelp>(NO_RANGE_HELP);
  const [starting, setStarting] = useState(false);
  const presetName = useId();

  useEffect(() => {
    const unregister = register({
      shown: (shown, resetDraft) => {
        setSettings(shown);
        if (resetDraft) setDraft(draftOf(shown.custom));
      },
      accepted: () => setRangeHelp(NO_RANGE_HELP),
      refused: (custom) => setRangeHelp(rangeHelpFor(custom)),
      loadFailed: () => setSettingsFailed(true),
    });
    load();
    return unregister;
  }, []);

  const view = timer.status === "ok" ? timer.view : null;

  // A view of another session is a transition this page may not have seen as a milestone (it
  // started elsewhere): it ends the one-shot notice for good. The idle view after an end
  // (`sessionId: null`) keeps it.
  if (notice && view?.sessionId != null && view.sessionId !== notice.sessionId) {
    setNotice(null);
  }

  const choosePreset = (preset: Preset) => {
    const current = latest();
    if (!current) return;
    save({ ...current, preset });
  };

  const commitCustom = () => {
    const custom = parseDraft(draft);
    const current = latest();
    if (!current || !custom) return;
    if (sameCustom(custom, current.custom)) {
      // Back to a spec Rust has (or is saving): an earlier range helper no longer applies.
      setRangeHelp(NO_RANGE_HELP);
      return;
    }
    save({ ...current, custom });
  };

  const start = (request: StartRequest_Deserialize) => {
    setStarting(true);
    commands
      .timerStart(request)
      .then((result) => {
        if (result.status === "ok") {
          setRangeHelp(NO_RANGE_HELP);
        } else if (result.error.kind === "invalidSpec") {
          setRangeHelp(rangeHelpFor(request.custom));
        } else {
          console.error("timer_start failed", result.error);
        }
      }, logFailure("timer_start"))
      .finally(() => setStarting(false));
  };

  const startChecked = () => {
    const preset = settings?.preset ?? DEFAULT_PRESET;
    // The draft, not the saved spec: a Start right after an edit uses the edit even while the
    // blur's settings_set is in flight. Rust uses the saved spec when `custom` is null.
    start({ preset, custom: preset === "custom" ? parseDraft(draft) : null });
  };

  const control = (
    name: string,
    command: () => Promise<
      { status: "ok"; data: TimerView_Serialize } | { status: "error"; error: TimerCommandError }
    >,
  ) => {
    command().then((result) => {
      if (result.status === "error") console.error(`${name} failed`, result.error);
    }, logFailure(name));
  };

  const shownNotice =
    notice?.text ?? (view && view.store !== "ok" ? STORE_LINES[view.store] : null);

  return (
    <div className="today">
      <h1 className="app-page-title" tabIndex={-1}>
        Today
      </h1>

      <div className="today-timer">
        <div className="today-ring">
          {view ? (
            <TimerRing
              size={280}
              remaining={view.remaining}
              remainingLabel={view.remainingLabel}
              progress={view.progress}
              mode={view.mode}
              clock={clock.status === "ok" ? clock.clock : undefined}
            />
          ) : null}
          {timer.status === "error" ? <p className="app-muted">Timer unavailable.</p> : null}
        </div>
        {view ? (
          <div className="today-status">
            <ModeChip mode={view.mode} />
            {view.state === "running" && view.finish ? (
              <p className="app-muted">
                Realistic finish · <span className="os-num">{view.finish}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* One slot; a new text is a new node, so each notice is announced once. */}
      {shownNotice ? <InlineNotice key={shownNotice}>{shownNotice}</InlineNotice> : null}

      {view && settingsFailed ? <p className="app-muted">Presets unavailable.</p> : null}
      {view && settings ? (
        <div className="today-presets">
          <fieldset className="os-choice-group">
            <legend>Preset</legend>
            {PRESETS.map(({ preset, label }) => (
              <label key={preset} className="os-choice">
                <input
                  type="radio"
                  name={presetName}
                  value={preset}
                  checked={settings.preset === preset}
                  onChange={() => choosePreset(preset)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {settings.preset === "custom" ? (
            <div className="today-custom">
              <Input
                label="Focus minutes"
                type="number"
                inputMode="numeric"
                min={FOCUS_RANGE.min}
                max={FOCUS_RANGE.max}
                value={draft.focus}
                helper={rangeHelp.focus ? FOCUS_RANGE_HELP : undefined}
                onChange={(event) => setDraft({ ...draft, focus: event.target.value })}
                onBlur={commitCustom}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitCustom();
                }}
              />
              <Input
                label="Break minutes"
                type="number"
                inputMode="numeric"
                min={BREAK_RANGE.min}
                max={BREAK_RANGE.max}
                value={draft.break}
                helper={rangeHelp.break ? BREAK_RANGE_HELP : undefined}
                onChange={(event) => setDraft({ ...draft, break: event.target.value })}
                onBlur={commitCustom}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitCustom();
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {view ? (
        <div className="today-actions">
          {view.state === "idle" ? (
            <StartButton
              onStart={startChecked}
              onQuickStart={() => start({ preset: "quick", custom: null })}
              finishTime={clock.status === "ok" ? (clock.idleFinish ?? undefined) : undefined}
              loading={starting}
            />
          ) : (
            <div className="os-actions">
              {view.state === "running" ? (
                <Button variant="quiet" onClick={() => control("timer_pause", commands.timerPause)}>
                  Pause
                </Button>
              ) : (
                <Button
                  variant="quiet"
                  onClick={() => control("timer_resume", commands.timerResume)}
                >
                  Resume
                </Button>
              )}
              <Button variant="ghost" onClick={() => control("timer_stop", commands.timerStop)}>
                End session
              </Button>
            </div>
          )}
          {view.notifications === "notDetermined" ? (
            <p className="app-muted">{EXPLANATION}</p>
          ) : null}
        </div>
      ) : null}

      <DevPanel />
    </div>
  );
}
