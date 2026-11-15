import { useSingleKeySetting } from "@domain/keyboard/useSingleKeySetting";
import { PagesButton } from "@domain/navigation/PagesButton";
import {
  Button,
  InlineNotice,
  Kbd,
  type NavPage,
  RoutineStep,
  ScrollRegion,
  WellnessNote,
} from "@orasenda/ui";
import { commands } from "@shared/ipc/bindings";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import type { RunView as Run, RunAnswer, useRoutines } from "./useRoutines";
import { useRunKeys } from "./useRunKeys";

type RunCall = ReturnType<typeof useRoutines>["runCall"];

/** A run's failure line: the last run Rust sent stays on screen above it. */
export type RunLine = "stepFailed" | "endFailed" | null;

const LINES: Record<Exclude<RunLine, null>, string> = {
  stepFailed: "That step couldn't be saved. Your data is safe; try again in a moment.",
  endFailed: "The routine couldn't end just now. Your data is safe; try again in a moment.",
};

/** The row's line when `settings_get` failed: single keys stay off, so only the buttons work. */
const SETTINGS_FAILED =
  "Your settings can't be read right now, so Enter and S work only on the buttons.";

const answered = (run: Run) => run.done + run.skipped;

/**
 * The run on screen, and its calls. Two sources say where a run is: `view.run` (the open run, from
 * `routines_list` and `routines-changed`) and the run a `run_*` call answered. For the same run the
 * one with more steps answered is newer (a run only moves forward); on a tie the view wins, since
 * an event can carry a renamed step. A run a call answered as ended stays on screen, finished,
 * until the person goes back (`view.run` is None by then). Without either, there is no run view.
 */
export function useRun(open: Run | null, runCall: RunCall, onStartFailed: () => void) {
  const [answer, setAnswer] = useState<{ run: Run; ended: boolean } | null>(null);
  const [line, setLine] = useState<RunLine>(null);
  // The run a call answered as stopped. `view.run` can still hold it when the read-back after
  // `run_end` failed; after Back it must not show as open again (every call on it is NotFound).
  const [stopped, setStopped] = useState<string | null>(null);
  // One answer at a time: a press while a run call is in flight is not a second answer.
  const busy = useRef(false);

  let shown: { run: Run; ended: boolean } | null = null;
  if (answer?.ended) shown = answer;
  else if (open && open.id !== stopped) {
    const newer = answer && answer.run.id === open.id && answered(answer.run) > answered(open);
    shown = newer && answer ? answer : { run: open, ended: false };
  }

  const send = useCallback(
    async (
      name: string,
      call: () => ReturnType<typeof commands.runStep>,
      failed: RunLine,
      ended: (run: Run) => boolean,
    ): Promise<RunAnswer | null> => {
      if (busy.current) return null;
      busy.current = true;
      setLine(null);
      const result = await runCall(name, call);
      busy.current = false;
      if (result.status === "ok") {
        const over = ended(result.run);
        setAnswer({ run: result.run, ended: over });
        if (over) setStopped(result.run.id);
      } else setLine(failed);
      return result;
    },
    [runCall],
  );

  const start = useCallback(
    (routineId: string) => {
      void send(
        "run_start",
        () => commands.runStart(routineId),
        null,
        () => false,
      ).then((result) => {
        if (result?.status === "error") onStartFailed();
      });
    },
    [send, onStartFailed],
  );

  const runId = shown?.run.id ?? null;
  const step = (outcome: "done" | "skip") => {
    if (runId === null) return;
    void send(
      "run_step",
      () => commands.runStep(runId, outcome),
      "stepFailed",
      (run) => run.current === null,
    );
  };
  const end = () => {
    if (runId === null) return;
    void send(
      "run_end",
      () => commands.runEnd(runId),
      "endFailed",
      () => true,
    );
  };
  const back = () => {
    setAnswer(null);
    setLine(null);
  };

  return { shown, line, start, done: () => step("done"), skip: () => step("skip"), end, back };
}

export type RunState = ReturnType<typeof useRun>;

type Props = {
  run: RunState;
  /** The routine's wellness note, when Rust marks the run as templated. */
  note: string | null;
  compact: boolean;
  onNavigate(page: NavPage): void;
};

/** What the one polite live region says: the new step, or the closing line. */
function announcement(run: Run, ended: boolean): string {
  const current = run.current === null ? undefined : run.steps[run.current];
  if (ended || !current) return run.line;
  return `${run.line}. ${current.name}`;
}

/**
 * The run view (canvas pick A, one step): `RoutineStep` with Done (primary, Enter), Skip for today
 * (S) and End routine (Esc), the failure line, the wellness note and one polite live region. Focus
 * moves to the step name after each answer, and to Back to routines once the run has ended.
 */
export function RunView({ run, note, compact, onNavigate }: Props): ReactElement | null {
  const { on: singleKeys, failed: settingsFailed } = useSingleKeySetting();
  const stepName = useRef<HTMLHeadingElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const shown = run.shown;
  const ended = shown?.ended === true || shown?.run.current === null;
  const open = shown !== null && !ended;

  useRunKeys({
    singleKeys,
    done: open ? run.done : null,
    skip: open ? run.skip : null,
    leave: ended ? run.back : run.end,
  });

  // The step on screen: a new one (or the end) moves focus and says itself once.
  const at = shown ? `${shown.run.id}:${ended ? "end" : shown.run.current}` : null;
  const [said, setSaid] = useState("");
  // Only a change of step or end moves focus; a renamed step or a failed call does not.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by `at` on purpose
  useEffect(() => {
    if (at === null || !shown) return;
    const back = frame.current?.querySelector<HTMLElement>("[data-run-back]");
    (ended ? back : stepName.current)?.focus();
    setSaid(announcement(shown.run, ended));
  }, [at]);

  if (!shown) return null;
  const r = shown.run;
  const current = r.current === null ? undefined : r.steps[r.current];
  const step = current ?? r.steps[0] ?? { name: "", detail: [], optional: false };

  const actions = ended ? (
    <Button data-run-back="" variant="primary" onClick={run.back} aria-keyshortcuts="Escape">
      Back to routines
    </Button>
  ) : (
    <>
      <Button
        variant="primary"
        onClick={run.done}
        aria-keyshortcuts={singleKeys ? "Enter" : undefined}
      >
        Done
        {singleKeys ? <Kbd keys={"↩"} inTooltip /> : null}
      </Button>
      <Button onClick={run.skip} aria-keyshortcuts={singleKeys ? "S" : undefined}>
        Skip for today
        {singleKeys ? <Kbd keys="S" inTooltip /> : null}
      </Button>
      <Button variant="ghost" onClick={run.end} aria-keyshortcuts="Escape">
        End routine
        <Kbd keys="Esc" inTooltip />
      </Button>
    </>
  );

  return (
    <div
      ref={frame}
      data-slot="routine-run"
      className="flex h-full min-h-0 flex-col gap-2 bg-surface p-4 text-ink sm:px-6 sm:pt-5 sm:pb-6"
    >
      {compact ? (
        <div className="flex min-h-hit-min shrink-0 items-center">
          <PagesButton current="routines" onNavigate={onNavigate} />
        </div>
      ) : null}
      <div className="min-h-hit-min shrink-0">
        <InlineNotice variant="row" tone={run.line || settingsFailed ? "attention" : "neutral"}>
          {run.line ? LINES[run.line] : settingsFailed ? SETTINGS_FAILED : ""}
        </InlineNotice>
      </div>
      <div className="flex min-h-0 flex-1 flex-col *:flex-1">
        <ScrollRegion label="Routine run">
          <div className="flex max-w-content-width flex-col gap-6 p-1">
            <RoutineStep
              routineName={r.routineName}
              progressLine={ended ? undefined : r.line}
              step={{ name: step.name, detail: step.detail, optional: step.optional }}
              steps={r.steps.map((s) => ({ name: s.name, state: s.state }))}
              current={r.current ?? undefined}
              finished={ended}
              finishedLine={ended ? r.line : undefined}
              stepNameRef={stepName}
              actions={actions}
            />
            {r.wellness ? <WellnessNote as="p">{note ?? undefined}</WellnessNote> : null}
          </div>
        </ScrollRegion>
      </div>
      <p data-slot="routine-run-live" className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
