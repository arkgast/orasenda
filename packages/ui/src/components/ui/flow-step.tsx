import type { KeyboardEvent, ReactElement, ReactNode, Ref } from "react";
import { Button } from "./button";

export interface FlowStepProps {
  /** The step's name: the `h1` and the focus target. */
  title: string;
  /** Progress in words, for example "Step 2 of 4". Also the key that cross-fades the step. */
  progress: string;
  children?: ReactNode;
  /** The one primary action (Continue, or Back to Review), supplied by the host. */
  primary: ReactNode;
  /** A visible quiet "Not now" for an optional step. Omit it on a step that has none. */
  notNow?: { label: string; onClick: () => void };
  /** Ends the flow: the End button and Esc. */
  onEnd: () => void;
  /** Points at the `h1`, so the host can move focus to it after each step. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The frame of a review flow: progress above the heading, the step body, and a footer with
 * End at the start and Not now (when given) and the primary at the end.
 * The frame owns no live region; the host announces each step.
 */
export function FlowStep(props: FlowStepProps): ReactElement {
  // An inner control that handled Esc (preventDefault or stopPropagation) keeps the flow open.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    props.onEnd();
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc is caught here as it bubbles from the controls inside; the frame itself is not a control
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the same handler, seen as a generic element
    <div
      data-slot="flow-step"
      onKeyDown={onKeyDown}
      className="flex h-full flex-col gap-2 bg-surface p-4 text-ink sm:px-6 sm:pt-5 sm:pb-6"
    >
      <div
        // Keyed by the step, so each new step mounts afresh and fades in from its starting style.
        key={props.progress}
        data-slot="flow-step-body"
        className="flex min-h-0 flex-1 flex-col gap-2 opacity-100 transition-opacity duration-calm ease-calm starting:opacity-0 motion-reduce:transition-none"
      >
        <p data-slot="flow-step-progress" className="m-0 text-body-sm text-ink-muted">
          {props.progress}
        </p>
        <h1
          ref={props.headingRef}
          tabIndex={-1}
          data-slot="flow-step-title"
          className="m-0 text-title text-ink outline-focus-ring outline-offset-2 focus-visible:outline-2"
        >
          {props.title}
        </h1>
        <div data-slot="flow-step-content" className="min-h-0 flex-1 overflow-hidden">
          {props.children}
        </div>
      </div>
      <footer
        data-slot="flow-step-footer"
        className="flex min-h-control-lg shrink-0 flex-wrap items-center gap-2"
      >
        <Button variant="ghost" aria-keyshortcuts="Escape" onClick={props.onEnd}>
          End
        </Button>
        <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
          {props.notNow ? (
            <Button variant="ghost" onClick={props.notNow.onClick}>
              {props.notNow.label}
            </Button>
          ) : null}
          {props.primary}
        </div>
      </footer>
    </div>
  );
}
