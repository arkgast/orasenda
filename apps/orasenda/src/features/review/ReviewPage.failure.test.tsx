import { deferred, reviewView, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { emitReviewChanged, primaries, renderReview } from "./ReviewPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

test("load_failure_line_try_again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const { container, backend } = await renderReview({
    review_get: () => {
      if (fail) throw "store";
      return reviewView();
    },
  });
  expect(screen.getByText("Orasenda can't load your review right now.")).toBeInTheDocument();
  expect(screen.getByText("It's kept on this Mac.")).toBeInTheDocument();
  expect(primaries(container)).toHaveLength(0);
  expect(screen.queryByRole("region", { name: /^Today · / })).toBeNull();
  fail = false;
  screen.getByRole("button", { name: /^Try again/ }).focus();
  fireEvent.click(screen.getByRole("button", { name: /^Try again/ }));
  await settle();
  expect(screen.getByRole("region", { name: /^Today · / })).toBeInTheDocument();
  expect(screen.queryByText("Orasenda can't load your review right now.")).toBeNull();
  expect(backend.calls.filter((c) => c.cmd === "review_get")).toHaveLength(2);
  // The button that had focus is gone: focus lands on the page heading, not on the body.
  expect(screen.getByRole("heading", { name: "Review", level: 1 })).toHaveFocus();
});

test("a_refused_load_is_the_same_failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderReview({ review_get: () => Promise.reject("store") });
  expect(screen.getByText("Orasenda can't load your review right now.")).toBeInTheDocument();
});

test("a_stale_reply_after_a_newer_event_is_dropped", async () => {
  const slow = deferred<ReturnType<typeof reviewView>>();
  await renderReview({ review_get: () => slow.promise });
  await emitReviewChanged(
    reviewView({ today: { ...reviewView().today, dayLabel: "Wednesday 18 November" } }),
  );
  expect(screen.getByRole("region", { name: "Today · Wednesday 18 November" })).toBeInTheDocument();
  await act(async () => slow.resolve(reviewView()));
  expect(screen.getByRole("region", { name: "Today · Wednesday 18 November" })).toBeInTheDocument();
});
