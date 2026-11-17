import { events, type ReviewView } from "@shared/ipc/bindings";
import { mockBackend, type Replies, reviewView, settle } from "@shared/test/fixtures";
import { act, render, screen } from "@testing-library/react";
import { ReviewPage } from "./ReviewPage";

type Props = Partial<Parameters<typeof ReviewPage>[0]>;

/** Renders the Review page on the mocked backend and lets the first view land. */
export async function renderReview(replies: Replies = {}, props: Props = {}) {
  const backend = mockBackend({ review_get: () => reviewView(), ...replies });
  const view = render(<ReviewPage onNavigate={() => {}} {...props} />);
  await settle();
  return { backend, ...view };
}

/** Sends `review-changed` with `view`, as Rust does after a change. */
export async function emitReviewChanged(view: ReviewView): Promise<void> {
  await act(async () => {
    await events.reviewChanged.emit(view);
  });
}

/** The page's primary buttons (there is at most one). */
export function primaries(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="button"][data-variant="primary"]'),
  );
}

/** The section named `name` (an h2 with the section's aria-labelledby). */
export function section(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}
