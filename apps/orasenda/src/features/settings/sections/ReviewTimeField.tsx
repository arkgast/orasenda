import { Input } from "@orasenda/ui";
import { useState } from "react";
import { effectiveReviewTime, parseReviewTime, REVIEW_TIME, timeText } from "./reviewTime";

type Props = {
  /** The stored minutes; a value outside 04:00 to 23:59 reads as 17:30. */
  saved: number;
  disabled: boolean;
  onCommit: (minutes: number) => void;
};

/** The shared review time: saves on blur or Return, and a time outside the range is not sent. */
export function ReviewTimeField({ saved, disabled, onCommit }: Props) {
  const shown = timeText(effectiveReviewTime(saved));
  const [draft, setDraft] = useState(shown);
  // A new stored value replaces the draft while rendering, so no stale frame and focus stays.
  const [base, setBase] = useState(shown);
  if (base !== shown) {
    setBase(shown);
    setDraft(shown);
  }
  const commit = () => {
    const minutes = parseReviewTime(draft);
    // Keep the last good value for anything outside the range or half typed.
    if (minutes === null) setDraft(shown);
    else if (draft !== shown) onCommit(minutes);
  };
  return (
    <Input
      id="review-time"
      className="max-w-field-width"
      label="Time of day"
      type="time"
      min={timeText(REVIEW_TIME.min)}
      max={timeText(REVIEW_TIME.max)}
      helper="From 04:00 to 23:59."
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") setDraft(shown);
      }}
    />
  );
}
