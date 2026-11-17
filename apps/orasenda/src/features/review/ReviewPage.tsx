import { PagesButton } from "@domain/navigation/PagesButton";
import { Button, InlineNotice, type NavPage, PageFrame, ScrollRegion } from "@orasenda/ui";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import type { ReactElement } from "react";
import { type Flow, Overview, primaryFlow, START_LABELS } from "./Overview";
import { useReview } from "./useReview";
import "./review.css";

/** The seam V17 (shutdown) and V20 (weekly) fill: the flows replace the overview in place. */
function noFlowYet(_flow: Flow): void {}

type Props = {
  onNavigate(page: NavPage): void;
  /** Starts a flow; V17 and V20 provide it. Until then nothing opens. */
  onStart?: (flow: Flow) => void;
};

/** The Review page: today's shutdown and the planned week, with the one primary at the header's end. */
export function ReviewPage({ onNavigate, onStart = noFlowYet }: Props): ReactElement {
  const { compact } = useWindowLayout();
  const { review, retry } = useReview();
  const view = review.status === "ok" ? review.view : null;
  const lead = view ? primaryFlow(view.primary) : null;

  const status =
    review.status === "error" ? (
      <InlineNotice
        variant="row"
        tone="attention"
        actionLabel="Try again"
        actionName="Try again loading your review"
        onAction={retry}
      >
        Orasenda can&apos;t load your review right now.
      </InlineNotice>
    ) : (
      <InlineNotice variant="row">{""}</InlineNotice>
    );

  return (
    <div className="app-review-page">
      <PageFrame
        title="Review"
        compactPicker={
          compact ? <PagesButton current="review" onNavigate={onNavigate} /> : undefined
        }
        primary={
          lead ? (
            <Button variant="primary" onClick={() => onStart(lead)}>
              {START_LABELS[lead]}
            </Button>
          ) : undefined
        }
        status={status}
      >
        <ScrollRegion label="Review">
          {view ? <Overview view={view} onStart={onStart} /> : null}
          {review.status === "error" ? (
            <p className="app-review-line">It&apos;s kept on this Mac.</p>
          ) : null}
        </ScrollRegion>
      </PageFrame>
    </div>
  );
}
