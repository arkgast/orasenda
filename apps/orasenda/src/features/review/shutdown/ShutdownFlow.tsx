import { Button, FlowStep, InlineNotice, ScrollRegion } from "@orasenda/ui";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { MoveToast } from "./MoveToast";
import { ReflectStep } from "./ReflectStep";
import { UnfinishedStep } from "./UnfinishedStep";
import { useFlowEsc } from "./useFlowEsc";
import { STEP_TITLES, useShutdown } from "./useShutdown";

type Props = {
  /** Leaves the flow, for End, Esc and Back to Review. Earlier steps stay applied. */
  onClose(): void;
};

/**
 * The daily shutdown in four steps, in `FlowStep`. A step applies on Continue; End (Esc) keeps the
 * earlier steps and drops the current one. Focus goes to each step's heading (the last step's one
 * button), and one polite region says the step in words.
 */
export function ShutdownFlow({ onClose }: Props): ReactElement {
  const state = useShutdown();
  const { load, step } = state;
  const heading = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Esc also ends the flow when focus sits outside the frame. No single keys: text fields need them.
  useFlowEsc(onClose);

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
        <FlowStep title="Shutdown" progress="" headingRef={heading} onEnd={onClose} primary={null}>
          <InlineNotice
            actionLabel="Try again"
            actionName="Try again loading your shutdown"
            onAction={state.retry}
          >
            Orasenda can&apos;t load your shutdown right now. It&apos;s kept on this Mac.
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
        notNow={step === 2 ? { label: "Not now", onClick: state.skipReflect } : undefined}
      >
        {step === 0 ? (
          <UnfinishedStep
            view={view}
            picked={state.picked}
            line={state.line}
            onToggle={state.toggle}
          />
        ) : null}
        {step === 1 ? <Tomorrow view={view} /> : null}
        {step === 2 ? (
          <ReflectStep
            draft={state.draft}
            line={state.line}
            disabled={state.busy}
            onChange={state.setDraft}
          />
        ) : null}
      </FlowStep>
      {state.toast ? (
        <MoveToast toast={state.toast} onUndo={state.undo} onDismiss={state.dismissToast} />
      ) : null}
    </div>
  );
}

/** Step 2: tomorrow as Rust words it, read-only. */
function Tomorrow({ view }: { view: { tomorrow: string[] } }): ReactElement {
  return (
    <ScrollRegion label="Tomorrow">
      <div className="app-shutdown-body">
        {view.tomorrow.length === 0 ? (
          <p className="app-review-line">Nothing is planned for tomorrow.</p>
        ) : (
          <ul className="app-shutdown-lines">
            {view.tomorrow.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
      </div>
    </ScrollRegion>
  );
}
