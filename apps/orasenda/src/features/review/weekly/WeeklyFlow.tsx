import { useTaskOptions } from "@domain/board/useTaskOptions";
import { useEscFallback } from "@domain/keyboard/useEscFallback";
import { Button, FlowStep, InlineNotice, Input, ScrollRegion, TextArea } from "@orasenda/ui";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { LookBackStep } from "./LookBackStep";
import { PrioritiesStep } from "./PrioritiesStep";
import { STEP_TITLES, useWeekly } from "./useWeekly";
import "./weekly.css";

type Props = {
  /** Leaves the flow, for End, Esc and Back to Review. Earlier steps stay applied. */
  onClose(): void;
};

/**
 * The weekly review in four steps, in `FlowStep`: look back, one improvement and notes, up to
 * three priorities, and "Week planned.". A step applies on Continue; End (Esc) keeps the earlier
 * steps and drops the current one. Focus goes to each step's heading (the last step's one
 * button), and one polite region says the step in words.
 */
export function WeeklyFlow({ onClose }: Props): ReactElement {
  const state = useWeekly();
  const options = useTaskOptions();
  const { load, step, draft } = state;
  const heading = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Esc also ends the flow when focus sits outside the frame. No single keys: text fields need them.
  useEscFallback(onClose);

  useEffect(() => {
    if (load.status === "loading") return;
    if (load.status === "ok" && step === 3) {
      root.current
        ?.querySelector<HTMLElement>('[data-slot="flow-step-footer"] [data-variant="primary"]')
        ?.focus();
    } else heading.current?.focus();
  }, [load.status, step]);

  const announcement = load.status === "ok" ? `Step ${step + 1} of 4, ${STEP_TITLES[step]}` : "";
  const live = (
    <p data-slot="flow-live" role="status" aria-live="polite" className="app-review-sr">
      {announcement}
    </p>
  );

  if (load.status === "loading") return <div ref={root}>{live}</div>;
  if (load.status === "error") {
    return (
      <div ref={root} className="app-shutdown-flow">
        {live}
        <FlowStep
          title="Weekly review"
          progress=""
          headingRef={heading}
          onEnd={onClose}
          primary={null}
        >
          <InlineNotice
            actionLabel="Try again"
            actionName="Try again loading your weekly review"
            onAction={state.retry}
          >
            Orasenda can&apos;t load your weekly review right now. It&apos;s kept on this Mac.
          </InlineNotice>
        </FlowStep>
      </div>
    );
  }

  const { view } = load;
  const last = step === 3;
  const primary = (
    <Button
      variant="primary"
      loading={state.busy && !last}
      onClick={last ? onClose : () => void state.next()}
    >
      {last ? "Back to Review" : "Continue"}
    </Button>
  );
  return (
    <div ref={root} className="app-shutdown-flow">
      {live}
      <FlowStep
        title={STEP_TITLES[step] ?? ""}
        progress={`Step ${step + 1} of 4`}
        headingRef={heading}
        onEnd={onClose}
        primary={primary}
        notNow={step === 1 || step === 2 ? { label: "Not now", onClick: state.skip } : undefined}
      >
        <div className="app-weekly-stage">
          {step === 0 ? <LookBackStep view={view} /> : null}
          {step === 1 ? (
            <>
              <ScrollRegion label="One improvement">
                <div className="app-shutdown-body">
                  {state.line ? <InlineNotice>{state.line}</InlineNotice> : null}
                  <p className="app-review-line">Both are optional.</p>
                  <Input
                    label="One improvement for next week"
                    value={draft.improvement}
                    disabled={state.busy}
                    onChange={(event) => state.change({ improvement: event.target.value })}
                  />
                  <TextArea
                    label="Notes"
                    rows={3}
                    value={draft.notes}
                    disabled={state.busy}
                    onChange={(event) => state.change({ notes: event.target.value })}
                  />
                  <BackButton onClick={state.back} />
                </div>
              </ScrollRegion>
            </>
          ) : null}
          {step === 2 ? (
            <PrioritiesStep
              picks={draft.picks}
              options={options}
              line={state.line}
              tooLong={state.priorityTooLong}
              onChange={(picks) => state.change({ picks })}
              onBack={state.back}
            />
          ) : null}
          {step === 3 ? <Planned line={view.completedLine} /> : null}
        </div>
      </FlowStep>
    </div>
  );
}

function BackButton({ onClick }: { onClick(): void }): ReactElement {
  return (
    <div className="app-weekly-back">
      <Button variant="quiet" onClick={onClick}>
        Back
      </Button>
    </div>
  );
}

/** Step 4 only confirms: the week was planned, in Rust's words. */
function Planned({ line }: { line: string | null }): ReactElement {
  return (
    <div className="app-shutdown-body">
      <p className="app-review-line">{line ?? "Week planned."}</p>
    </div>
  );
}
