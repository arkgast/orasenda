import { Button, InlineNotice, Input, ModeChip, StartButton, TimerRing } from "@orasenda/ui";
import { useEffect, useId, useRef, useState } from "react";
import type {
  CustomSpec,
  MilestoneEvent_Serialize,
  MilestoneKind,
  Preset,
  StartRequest_Deserialize,
  StoreStatus,
  TimerCommandError,
  TimerSettings,
  TimerView_Serialize,
} from "../bindings";
import { commands } from "../bindings";
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

const RANGE_HELP = "Between 5 and 180 minutes.";

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

/** `true` when `Keys` lists every key of `T`; any key left out makes it `false`. */
export type CoversEveryKey<T, Keys extends readonly (keyof T)[]> = [
  Exclude<keyof T, Keys[number]>,
] extends [never]
  ? true
  : false;

/** Fails to compile unless `Check` is `true`. */
type AssertTrue<Check extends true> = Check;

/** Every `CustomSpec` field, compared by `sameCustom`. */
export const CUSTOM_KEYS = [
  "focusMin",
  "breakMin",
] as const satisfies readonly (keyof CustomSpec)[];

/**
 * Every `TimerSettings` field, compared by `sameSettings`. A field added to the generated type
 * must be listed here, or a change to only that field would never be sent (#114).
 */
export const SETTINGS_KEYS = [
  "preset",
  "custom",
  "notifySessionEnd",
] as const satisfies readonly (keyof TimerSettings)[];

// Compile-time exhaustiveness (#114): `tsc` fails here when bindings.ts gains a field these lists miss.
export type CustomKeysAreComplete = AssertTrue<CoversEveryKey<CustomSpec, typeof CUSTOM_KEYS>>;
export type SettingsKeysAreComplete = AssertTrue<
  CoversEveryKey<TimerSettings, typeof SETTINGS_KEYS>
>;

// A new non-`custom` field must be a primitive, or `sameSettings` would compare it by reference;
// an object field fails to compile here until it gets its own compare.
export type OtherSettingsArePrimitive = AssertTrue<
  [
    Exclude<
      TimerSettings[Exclude<keyof TimerSettings, "custom">],
      string | number | boolean | null
    >,
  ] extends [never]
    ? true
    : false
>;

function sameCustom(a: CustomSpec, b: CustomSpec): boolean {
  return CUSTOM_KEYS.every((key) => a[key] === b[key]);
}

function sameSettings(a: TimerSettings | null, b: TimerSettings | null): boolean {
  if (!a || !b) return a === b;
  // `custom` is the one object field; a new object field needs its own compare here.
  return SETTINGS_KEYS.every((key) =>
    key === "custom" ? sameCustom(a.custom, b.custom) : a[key] === b[key],
  );
}

function logFailure(name: string) {
  return (error: unknown) => console.error(`${name} failed`, error);
}

/**
 * Today: the ring, the mode, the preset choice and the one primary action. Every time string on
 * it comes formatted from Rust (the view or the clock tick); the only local state is the
 * one-shot notice, the saved settings, the Custom drafts and whether the range helper shows.
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
  // `settings` is what the page shows; `intended` holds the same value, set synchronously, so a
  // change made while an earlier settings_set is in flight builds on it, never on a stale render.
  // `accepted` is the last value Rust took, which a failed write rolls back to.
  // Saves are chained, never overlapped (docs/conventions.md, "Newest wins"): at most one
  // settings_set is in flight (`saving`), and when it answers, the latest `intended` is sent next
  // if Rust doesn't hold it yet. So Rust applies saves in the order they were meant, and every
  // answer is judged against a settled store.
  const [settings, setSettings] = useState<TimerSettings | null>(null);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const intended = useRef<TimerSettings | null>(null);
  const accepted = useRef<TimerSettings | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const [draft, setDraft] = useState<Draft>({ focus: "", break: "" });
  const [showRangeHelp, setShowRangeHelp] = useState(false);
  const [starting, setStarting] = useState(false);
  const presetName = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    commands.settingsGet().then(
      (saved) => {
        if (cancelled) return;
        intended.current = saved;
        accepted.current = saved;
        setSettings(saved);
        setDraft(draftOf(saved.custom));
      },
      (error: unknown) => {
        console.error("settings_get failed", error);
        if (!cancelled) setSettingsFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const view = timer.status === "ok" ? timer.view : null;

  // A view of another session is a transition this page may not have seen as a milestone (it
  // started elsewhere): it ends the one-shot notice for good. The idle view after an end
  // (`sessionId: null`) keeps it.
  if (notice && view?.sessionId != null && view.sessionId !== notice.sessionId) {
    setNotice(null);
  }

  const intend = (next: TimerSettings) => {
    intended.current = next;
    setSettings(next);
  };

  const rollBack = () => {
    const last = accepted.current;
    if (!last) return;
    intend(last);
    setDraft(draftOf(last.custom));
  };

  /** Sends the latest intent when nothing is in flight and Rust doesn't hold it yet. */
  const flush = () => {
    const next = intended.current;
    if (saving.current || !mounted.current || !next || sameSettings(next, accepted.current)) {
      return;
    }
    saving.current = true;
    const settled = () => {
      saving.current = false;
      flush();
    };
    const failed = (error: unknown) => {
      console.error("settings_set failed", error);
      // Changes queued behind this save are dropped too: the screen shows what Rust holds.
      if (mounted.current) rollBack();
    };
    commands
      .settingsSet(next)
      .then((result) => {
        if (result.status === "ok") {
          accepted.current = next;
          if (mounted.current && sameSettings(intended.current, next)) setShowRangeHelp(false);
        } else if (result.error.kind === "invalidSpec") {
          if (!mounted.current) return;
          const latest = intended.current;
          // A spec typed since this one was sent replaces it, and its own save decides.
          if (!latest || !sameCustom(latest.custom, next.custom) || !accepted.current) return;
          // Keep the typed draft beside the helper, but never resend the rejected spec.
          intend({ ...latest, custom: accepted.current.custom });
          setShowRangeHelp(true);
        } else {
          failed(result.error);
        }
      }, failed)
      .finally(settled);
  };

  const save = (next: TimerSettings) => {
    intend(next);
    flush();
  };

  const choosePreset = (preset: Preset) => {
    const latest = intended.current;
    if (!latest) return;
    save({ ...latest, preset });
  };

  const commitCustom = () => {
    const custom = parseDraft(draft);
    const latest = intended.current;
    if (!latest || !custom) return;
    if (custom.focusMin === latest.custom.focusMin && custom.breakMin === latest.custom.breakMin) {
      // Back to a spec Rust has (or is saving): an earlier range helper no longer applies.
      setShowRangeHelp(false);
      return;
    }
    save({ ...latest, custom });
  };

  const start = (request: StartRequest_Deserialize) => {
    setStarting(true);
    commands
      .timerStart(request)
      .then((result) => {
        if (result.status === "ok") {
          setShowRangeHelp(false);
        } else if (result.error.kind === "invalidSpec") {
          setShowRangeHelp(true);
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
                min={5}
                max={180}
                value={draft.focus}
                helper={showRangeHelp ? RANGE_HELP : undefined}
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
                min={1}
                max={60}
                value={draft.break}
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
