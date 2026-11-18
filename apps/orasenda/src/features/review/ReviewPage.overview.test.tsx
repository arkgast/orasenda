import { priorityView, reviewView, settle, shutdownView, weeklyView } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { emitReviewChanged, primaries, renderReview, section } from "./ReviewPage.support";
import { TWO } from "./shutdown/ShutdownFlow.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("overview_is_a_page_frame_titled_review_with_today_and_this_week", async () => {
  await renderReview();
  expect(screen.getByRole("heading", { level: 1, name: "Review" })).toBeInTheDocument();
  const today = section("Today");
  expect(today).toHaveTextContent("Tuesday 17 November");
  expect(today).toHaveTextContent("Ready when you are.");
  const week = section("This week");
  expect(week).toHaveTextContent("Planning the week of 16 November");
  expect(week).toHaveTextContent("One priority so far.");
  expect(screen.getByRole("region", { name: "Review" })).toBeInTheDocument();
});

test("primary_follows_view", async () => {
  const onStart = vi.fn();
  const { container } = await renderReview(
    { shutdown_get: () => shutdownView(), weekly_get: () => weeklyView() },
    { onStart },
  );
  let main = primaries(container);
  expect(main).toHaveLength(1);
  expect(main[0]).toHaveTextContent("Start shutdown");
  // The other flow is a secondary button inside its own section, not a primary.
  const other = within(section("This week")).getByRole("button", { name: "Start weekly review" });
  expect(other).toHaveAttribute("data-variant", "quiet");
  // Each button reports its start and opens its own flow.
  fireEvent.click(other);
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Look back" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^End/ }));
  expect(screen.getByRole("heading", { level: 1, name: "Review" })).toHaveFocus();
  main = primaries(container);
  fireEvent.click(main[0] as HTMLElement);
  expect(onStart.mock.calls).toEqual([["weekly"], ["shutdown"]]);
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Unfinished tasks" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^End/ }));
  expect(screen.getByRole("heading", { level: 1, name: "Review" })).toHaveFocus();

  await emitReviewChanged(reviewView({ primary: "weekly" }));
  main = primaries(container);
  expect(main).toHaveLength(1);
  expect(main[0]).toHaveTextContent("Start weekly review");
  const shutdown = within(section("Today")).getByRole("button", { name: "Start shutdown" });
  expect(shutdown).toHaveAttribute("data-variant", "quiet");
});

test("no_primary_when_none", async () => {
  const done = reviewView({
    primary: "none",
    today: {
      day: "2026-11-17",
      dayLabel: "Tuesday 17 November",
      done: true,
      line: "Shutdown complete at 17:42.",
    },
  });
  const { container } = await renderReview({ review_get: () => done });
  expect(primaries(container)).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Start shutdown" })).toBeNull();
});

test("look_again_after_completion", async () => {
  const onStart = vi.fn();
  const done = reviewView({
    primary: "none",
    today: {
      day: "2026-11-17",
      dayLabel: "Tuesday 17 November",
      done: true,
      line: "Shutdown complete at 17:42.",
    },
  });
  await renderReview({ review_get: () => done, shutdown_get: () => shutdownView() }, { onStart });
  const today = section("Today");
  expect(today).toHaveTextContent("Shutdown complete at 17:42.");
  fireEvent.click(within(today).getByRole("button", { name: /^Look again/ }));
  expect(onStart).toHaveBeenCalledWith("shutdown");
});

test("look_again_is_absent_before_completion", async () => {
  await renderReview();
  expect(within(section("Today")).queryByRole("button", { name: /^Look again/ })).toBeNull();
});

test("priorities_done_in_words", async () => {
  const view = reviewView({
    week: {
      ...reviewView().week,
      priorities: [
        priorityView({ taskId: "a", title: "Fix sync bug", line: "Fix sync bug · Doing" }),
        priorityView({ taskId: "b", title: "Write notes", done: true, line: "Write notes · Done" }),
      ],
    },
  });
  await renderReview({ review_get: () => view });
  const items = within(within(section("This week")).getByRole("list")).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent("Fix sync bug · Doing");
  expect(items[0]?.querySelector("svg")).toBeNull();
  // Done is a word and a shape, never colour alone.
  expect(items[1]).toHaveTextContent("Write notes · Done");
  expect(items[1]?.querySelector("svg")).not.toBeNull();
});

test("no_priorities_shows_no_list", async () => {
  const view = reviewView({ week: { ...reviewView().week, priorities: [] } });
  await renderReview({ review_get: () => view });
  expect(within(section("This week")).queryByRole("list")).toBeNull();
});

test("review_changed_replaces_the_view", async () => {
  await renderReview();
  await emitReviewChanged(
    reviewView({
      today: { ...reviewView().today, line: "Shutdown complete at 17:42.", done: true },
    }),
  );
  expect(section("Today")).toHaveTextContent("Shutdown complete at 17:42.");
});

test("end_after_a_move_takes_the_toast_with_the_flow", async () => {
  await renderReview(
    {
      shutdown_get: () => TWO,
      shutdown_move: () => ({ token: "t1", line: "Moved 2 tasks to Backlog." }),
    },
    { onStart: () => {} },
  );
  fireEvent.click(screen.getByRole("button", { name: "Start shutdown" }));
  await settle();
  const pick = screen.getByRole("button", { name: "Back to Backlog Write notes" });
  fireEvent.click(pick);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await settle();
  expect(document.querySelector('[data-slot="toast"]')).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^End/ }));
  expect(document.querySelector('[data-slot="toast"]')).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Review" })).toHaveFocus();
});
