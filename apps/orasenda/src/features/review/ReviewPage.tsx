import { PagesButton } from "@domain/navigation/PagesButton";
import { Button, InlineNotice, type NavPage, PageFrame, ScrollRegion } from "@orasenda/ui";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { type FlowAsk, takeFlowAsk } from "./flowAsk";
import { type Flow, Overview, primaryFlow, START_LABELS } from "./Overview";
import { ShutdownFlow } from "./shutdown/ShutdownFlow";
import { useReview } from "./useReview";
import { WeeklyFlow } from "./weekly/WeeklyFlow";
import "./review.css";

type Props = {
  onNavigate(page: NavPage): void;
  /** Told whenever a flow is started, from a button or an ask. The page opens the flow itself. */
  onStart?: (flow: Flow) => void;
  /** An ask from outside the page (the palette): opens its flow once per `seq`. */
  asked?: FlowAsk;
};

/** The Review page: today's shutdown and the planned week, with the one primary at the header's end. */
export function ReviewPage({ onNavigate, onStart, asked }: Props): ReactElement {
  const { compact } = useWindowLayout();
  const { review, retry } = useReview();
  const view = review.status === "ok" ? review.view : null;
  const page = useRef<HTMLDivElement>(null);
  const wasError = useRef(false);
  useEffect(() => {
    // Try again unmounts its own button once the load succeeds: focus goes to the heading.
    const active = document.activeElement;
    if (
      wasError.current &&
      review.status === "ok" &&
      (!active || active === document.body || !active.isConnected)
    ) {
      page.current?.querySelector<HTMLElement>("h1")?.focus();
    }
    wasError.current = review.status === "error";
  }, [review.status]);
  const lead = view ? primaryFlow(view.primary) : null;
  // The flow in progress replaces the overview in place.
  const [flow, setFlow] = useState<Flow | null>(null);
  const start = (next: Flow) => {
    onStart?.(next);
    setFlow(next);
  };
  const wasFlow = useRef(false);
  useEffect(() => {
    // Ending a flow gives focus back to the page's heading.
    if (wasFlow.current && flow === null) page.current?.querySelector<HTMLElement>("h1")?.focus();
    wasFlow.current = flow !== null;
  }, [flow]);
  // An ask opens its flow once, even on a fresh mount: the ask outlives the page (flowAsk.ts).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `start` only sets state, and `seq` is the ask
  useEffect(() => {
    const next = takeFlowAsk(asked);
    if (next) start(next);
  }, [asked?.seq]);

  const status =
    review.status === "error" ? (
      <InlineNotice
        variant="row"
        tone="attention"
        actionLabel="Try again"
        actionName="Try again loading your review"
        onAction={retry}
      >
        <span>
          Orasenda can&apos;t load your review right now. <span>It&apos;s kept on this Mac.</span>
        </span>
      </InlineNotice>
    ) : (
      <InlineNotice variant="row">{""}</InlineNotice>
    );

  if (flow === "shutdown") {
    return (
      <div className="app-review-page">
        <ShutdownFlow onClose={() => setFlow(null)} />
      </div>
    );
  }

  if (flow === "weekly") {
    return (
      <div className="app-review-page">
        <WeeklyFlow onClose={() => setFlow(null)} />
      </div>
    );
  }

  return (
    <div ref={page} className="app-review-page">
      <PageFrame
        title="Review"
        width="content"
        compactPicker={
          compact ? <PagesButton current="review" onNavigate={onNavigate} /> : undefined
        }
        primary={
          lead ? (
            <Button variant="primary" onClick={() => start(lead)}>
              {START_LABELS[lead]}
            </Button>
          ) : undefined
        }
        status={status}
      >
        <ScrollRegion label="Review" width="content">
          {view ? <Overview view={view} onStart={start} /> : null}
        </ScrollRegion>
      </PageFrame>
    </div>
  );
}
