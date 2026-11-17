import { argsOf, settle, weeklyView } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { heading, live, openWeekly, pickTask, press } from "./WeeklyFlow.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("weekly_by_keyboard_end_to_end", async () => {
  const { backend, onClose } = await openWeekly();
  expect(heading()).toHaveTextContent("Look back");
  await press("Continue");
  expect(heading()).toHaveTextContent("One improvement");
  fireEvent.change(screen.getByLabelText("One improvement for next week"), {
    target: { value: "  Start earlier " },
  });
  await press("Continue");
  expect(argsOf(backend.calls, "weekly_save")).toEqual([
    {
      weekStart: "2026-11-23",
      draft: { improvement: "  Start earlier ", notes: null, priorities: [] },
    },
  ]);
  expect(heading()).toHaveTextContent("Priorities");
  await pickTask(1, "sync", "Fix sync bug");
  await press("Continue");
  expect(argsOf(backend.calls, "weekly_complete")).toEqual([
    {
      weekStart: "2026-11-23",
      draft: { improvement: "Start earlier", notes: null, priorities: [{ task: "t1" }] },
    },
  ]);
  expect(heading()).toHaveTextContent("Week planned.");
  await press("Back to Review");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("last_improvement_first", async () => {
  await openWeekly({}, weeklyView({ lastImprovement: "Last week you chose: Stop at five" }));
  const line = screen.getByText("Last week you chose: Stop at five");
  const focus = screen.getByText("2h 10m of focus");
  expect(line.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("no_last_improvement_line_without_one", async () => {
  await openWeekly();
  expect(screen.queryByText(/Last week you chose/)).toBeNull();
});

test("look_back_shows_the_week_in_words_and_shapes", async () => {
  await openWeekly(
    {},
    weeklyView({
      lookBack: {
        ...weeklyView().lookBack,
        goal: { minutes: 720, words: "Goal 12h", line: "9h 40m of a 12h goal." },
        routineLines: ["Wind-down: finished 6 times."],
        habitLines: ["Drink water: done on 5 days."],
        estimateLine: "6 finished tasks had an estimate.",
        reflections: [{ dayLabel: "Monday 16 November", lines: ["Went well: a calm day"] }],
      },
    }),
  );
  expect(screen.getByText("Monday 16 to Friday 20 November")).toBeInTheDocument();
  expect(screen.getByText("9h 40m of a 12h goal.")).toBeInTheDocument();
  expect(screen.getByText("Wind-down: finished 6 times.")).toBeInTheDocument();
  expect(screen.getByText("Drink water: done on 5 days.")).toBeInTheDocument();
  expect(screen.getByText("6 finished tasks had an estimate.")).toBeInTheDocument();
  expect(screen.getByText("Monday 16 November")).toBeInTheDocument();
  expect(screen.getByText("Went well: a calm day")).toBeInTheDocument();
  expect(screen.getByText("1 task done")).toBeInTheDocument();
});

test("focus_heading_each_step", async () => {
  await openWeekly();
  expect(document.activeElement).toBe(heading());
  await press("Continue");
  expect(document.activeElement).toBe(heading());
  await press("Continue");
  expect(heading()).toHaveTextContent("Priorities");
  expect(document.activeElement).toBe(heading());
  await press("Continue");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back to Review" }));
});

test("live_region_step_words", async () => {
  await openWeekly();
  expect(live()).toHaveAttribute("aria-live", "polite");
  expect(live()).toHaveTextContent("Step 1 of 4, Look back");
  await press("Continue");
  expect(live()).toHaveTextContent("Step 2 of 4, One improvement");
  await press("Continue");
  expect(live()).toHaveTextContent("Step 3 of 4, Priorities");
  expect(document.querySelectorAll('[aria-live="polite"][data-slot="flow-live"]')).toHaveLength(1);
});

test("esc_ends_even_when_focus_is_outside_the_frame", async () => {
  const { onClose } = await openWeekly();
  (document.activeElement as HTMLElement | null)?.blur();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("esc_inside_the_frame_ends_once", async () => {
  const { onClose } = await openWeekly();
  fireEvent.keyDown(screen.getByRole("button", { name: "Continue" }), { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("esc_leaves_an_open_dialog_to_close_first", async () => {
  const { onClose } = await openWeekly();
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  fireEvent.keyDown(document.body, { key: "Escape" });
  dialog.remove();
  expect(onClose).not.toHaveBeenCalled();
});

test("load_failure_offers_try_again", async () => {
  let fail = true;
  await openWeekly({
    weekly_get: () => {
      if (fail) throw "store";
      return weeklyView();
    },
  });
  expect(screen.getByText(/can't load your weekly review/)).toBeInTheDocument();
  fail = false;
  await press("Try again loading your weekly review");
  expect(heading()).toHaveTextContent("Look back");
});

test("not_now_on_priorities_completes_with_the_saved_priorities", async () => {
  const saved = weeklyView({
    answers: {
      improvement: "Start earlier",
      notes: null,
      priorities: [
        { taskId: "t1", title: "Fix sync bug", done: false, line: "Fix sync bug · Doing" },
      ],
    },
  });
  const { backend } = await openWeekly({}, saved);
  await press("Continue");
  await press("Continue");
  await press("Not now");
  expect(argsOf(backend.calls, "weekly_complete")).toEqual([
    {
      weekStart: "2026-11-23",
      draft: { improvement: "Start earlier", notes: null, priorities: [{ task: "t1" }] },
    },
  ]);
  expect(heading()).toHaveTextContent("Week planned.");
});
