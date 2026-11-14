import type { RunView_Serialize, StepOutcome } from "@shared/ipc/bindings";
import { type Replies, routinesView, runView, SETTINGS, settle } from "@shared/test/fixtures";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderRoutines } from "./RoutinesPage.support";

/** A three-step run, worded as Rust words it. */
export function threeSteps(): RunView_Serialize {
  const base = runView();
  return runView({
    steps: [
      ...base.steps,
      {
        habitId: "habit-3",
        name: "Get outdoor light",
        detail: ["2-minute version: step outside."],
        optional: true,
        state: "upcoming",
      },
    ],
    total: 3,
    line: "Step 1 of 3",
  });
}

/** Rust's line for `run`, as `run_view.rs` words it. */
function lineOf(run: RunView_Serialize, stopped: boolean): string {
  if (run.current !== null) return `Step ${run.current + 1} of ${run.total}`;
  const verb = stopped ? "ended" : "finished";
  return `Routine ${verb}. ${run.done} of ${run.total} done today.`;
}

/**
 * A backend that keeps one run the way Rust does: `run_start` opens it, `run_step` answers the
 * current step, `run_end` stops it. `routines_list` shows it in `view.run` while it is open.
 */
export function runBackend(first: RunView_Serialize = threeSteps(), extra: Replies = {}) {
  let open: RunView_Serialize | null = null;
  const replies: Replies = {
    routines_list: () => routinesView({ run: open }),
    run_start: () => {
      open = { ...first };
      return open;
    },
    run_step: (args) => {
      if (!open || open.current === null) throw "notFound";
      const outcome = (args as { outcome: StepOutcome }).outcome;
      const at = open.current;
      const steps = open.steps.map((s, i) =>
        i === at
          ? { ...s, state: outcome === "done" ? ("done" as const) : ("skipped" as const) }
          : s,
      );
      const next = steps.findIndex((s) => s.state === "upcoming");
      const run: RunView_Serialize = {
        ...open,
        steps,
        current: next < 0 ? null : next,
        done: open.done + (outcome === "done" ? 1 : 0),
        skipped: open.skipped + (outcome === "skip" ? 1 : 0),
      };
      run.line = lineOf(run, false);
      open = run.current === null ? null : run;
      return run;
    },
    run_end: () => {
      if (!open) throw "notFound";
      const run: RunView_Serialize = { ...open, current: null };
      run.line = lineOf(run, true);
      open = null;
      return run;
    },
    ...extra,
  };
  return replies;
}

/** Single keys as saved: on by default in the fixtures. */
export function singleKeys(on: boolean): Replies {
  return { settings_get: () => ({ ...SETTINGS, singleKey: on }) };
}

/** Renders the page on a run backend and presses the routine's Start. */
export async function startRun(replies: Replies = runBackend()) {
  const rendered = await renderRoutines(replies);
  fireEvent.click(screen.getByRole("button", { name: "Start Morning Light & Movement" }));
  await flush();
  return rendered;
}

/** Lets the write chain, its answer and any read-back land. */
export async function flush() {
  for (let i = 0; i < 6; i += 1) await settle();
}

/** A key pressed where focus is now. */
export async function press(key: string) {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    fireEvent.keyDown(target, { key });
  });
  await flush();
}

/** The step name on screen (the focus target). */
export function stepName(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-slot=routine-step-name]") as HTMLElement;
}

/** What the one polite live region says. */
export function liveText(): string {
  return document.querySelector("[data-slot=routine-run-live]")?.textContent ?? "";
}
