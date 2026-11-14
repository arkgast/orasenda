import { type ReactElement, type ReactNode, type Ref, useId } from "react";
import { cn } from "../../lib/utils";

export type RoutineStepState = "upcoming" | "done" | "skipped";

export interface RoutineStepItem {
  name: string;
  state: RoutineStepState;
}

export interface RoutineStepProps {
  /** The routine's name: the run view's h1. */
  routineName: string;
  /** "Step 2 of 5". */
  progressLine?: string;
  /** The step on screen: its name, its detail lines (anchor, 2-minute version) and whether it is optional. */
  step: { name: string; detail?: string[]; optional?: boolean };
  /** Every step of the run in order, each with its state. */
  steps: RoutineStepItem[];
  /** The index of the step on screen. Defaults to the first upcoming step. */
  current?: number;
  /** The host's buttons: Done (primary), Skip for today, End routine; or Back to routines when finished. */
  actions?: ReactNode;
  /** The run is over: the step body gives way to the finished line. */
  finished?: boolean;
  /** "Routine finished. 4 of 5 done today." */
  finishedLine?: string;
  /** The step name (tabIndex -1): the host moves focus here after each answer. */
  stepNameRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

type Mark = RoutineStepState | "current";

const WORDS: Record<Mark, string> = {
  done: "Done",
  skipped: "Skipped",
  current: "Now",
  upcoming: "Upcoming",
};

// Shape first: a filled disc with a tick, a hollow ring with a dash, a ring around a dot, a dotted ring.
const MARKS: Record<Mark, string> = {
  done: "border-2 border-break bg-break text-on-break",
  skipped: "border-2 border-line-strong text-ink-muted",
  current: "border-2 border-focus text-focus",
  upcoming: "border-2 border-dotted border-line-strong",
};

function StepMark({ state }: { state: Mark }): ReactElement {
  return (
    <span
      data-slot="routine-step-mark"
      data-state={state}
      aria-hidden="true"
      className={cn(
        "inline-grid size-icon-lg flex-none place-items-center rounded-pill",
        MARKS[state],
      )}
    >
      {state === "done" ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="size-icon-sm fill-none stroke-current"
          strokeWidth={2.5}
          focusable="false"
        >
          <path d="M2 6.5 5 9.2 10 3" />
        </svg>
      ) : null}
      {state === "skipped" ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="size-icon-sm fill-none stroke-current"
          strokeWidth={2}
          focusable="false"
        >
          <path d="M3 6h6" />
        </svg>
      ) : null}
      {state === "current" ? <span className="size-2 rounded-pill bg-focus" /> : null}
    </span>
  );
}

/** The run view's body: one step at a time, with the whole run listed below in shape and word. */
export function RoutineStep({
  routineName,
  progressLine,
  step,
  steps,
  current,
  actions,
  finished,
  finishedLine,
  stepNameRef,
  className,
}: RoutineStepProps): ReactElement {
  const id = useId();
  const firstUpcoming = steps.findIndex((s) => s.state === "upcoming");
  const now = finished ? -1 : (current ?? firstUpcoming);
  return (
    <section
      data-slot="routine-step"
      aria-labelledby={`${id}-name`}
      className={cn("flex w-full max-w-content-width flex-col gap-fluid-stack", className)}
    >
      <header className="flex flex-col gap-1">
        <h1 id={`${id}-name`} className="m-0 text-title text-ink">
          {routineName}
        </h1>
        {progressLine ? (
          <p data-slot="routine-step-progress" className="m-0 text-body-sm text-ink-muted">
            {progressLine}
          </p>
        ) : null}
      </header>
      {finished ? (
        <p
          data-slot="routine-step-finished"
          className="m-0 flex items-center gap-3 text-heading text-ink"
        >
          <StepMark state="done" />
          {finishedLine}
        </p>
      ) : (
        // Keyed by the step, so each new step mounts afresh and fades in from its starting style.
        <div
          key={`${now}:${step.name}`}
          data-slot="routine-step-body"
          className="flex flex-col gap-2 opacity-100 transition-opacity duration-calm ease-calm starting:opacity-0 motion-reduce:transition-none"
        >
          <h2
            ref={stepNameRef}
            tabIndex={-1}
            data-slot="routine-step-name"
            className="m-0 text-heading text-ink outline-focus-ring outline-offset-2 focus-visible:outline-2"
          >
            {step.name}
            {step.optional ? (
              <>
                <span className="sr-only">, </span>
                <span className="ms-2 align-middle text-label text-routine uppercase">
                  Optional
                </span>
              </>
            ) : null}
          </h2>
          {step.detail?.length ? (
            <div data-slot="routine-step-detail" className="flex flex-col gap-1">
              {step.detail.map((line, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are static text and may repeat
                <p key={`${i}:${line}`} className="m-0 text-body text-ink-muted">
                  {line}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {actions ? (
        <div data-slot="routine-step-actions" className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
      <ol
        data-slot="routine-step-list"
        aria-label="Steps"
        className="m-0 flex list-none flex-col gap-2 p-0"
      >
        {steps.map((s, i) => {
          const mark: Mark = i === now ? "current" : s.state;
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: steps may share a name; the run's order is fixed
              key={i}
              aria-current={i === now ? "step" : undefined}
              className={cn(
                "flex min-h-hit-floor items-center gap-3 text-body",
                i === now ? "font-semibold text-ink" : "text-ink-muted",
              )}
            >
              <StepMark state={mark} />
              <span>{s.name}</span>
              <span className="sr-only">, </span>
              <span
                data-slot="routine-step-state"
                className="ms-auto text-label text-ink-muted uppercase"
              >
                {WORDS[mark]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
