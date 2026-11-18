import { events, type StatsRange, type StatsView_Serialize } from "@shared/ipc/bindings";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import {
  argsOf,
  barView,
  boardOf,
  deferred,
  emitMilestone,
  habitStat,
  reviewView,
  routinesView,
  settle,
  statsView,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { renderReview, section } from "./ReviewPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  resetSettingsQueueForTests();
});

const weeks8 = (over: Partial<StatsView_Serialize> = {}) =>
  statsView({
    range: "weeks8",
    summary: ["14h of focus over 8 weeks."],
    bars: [barView({ label: "This week", spoken: "This week, 3 hours" })],
    habits: [habitStat({ dots: null, line: "Done on 20 days in 8 weeks" })],
    ...over,
  });

const rangeOf = (args: unknown) => (args as { range: StatsRange }).range;

function reply(range: StatsRange): StatsView_Serialize {
  return range === "week" ? statsView() : weeks8();
}

const records = (root: HTMLElement) =>
  within(root).queryAllByRole("group", { name: /daily record$/ });
const dots = (root: HTMLElement) => records(root).flatMap((g) => within(g).queryAllByRole("img"));

test("stats_default_week", async () => {
  const { backend } = await renderReview({ review_stats: (a) => reply(rangeOf(a)) });
  expect(argsOf(backend.calls, "review_stats")).toEqual([{ range: "week" }]);
  const stats = section("Stats");
  expect(within(stats).getByRole("radio", { name: "Week" })).toBeChecked();
  expect(within(stats).getByRole("radio", { name: "8 weeks" })).not.toBeChecked();
  expect(within(stats).getByRole("radio", { name: "6 months" })).not.toBeChecked();
  expect(stats).toHaveTextContent("2h 10m of focus this week.");
  expect(stats).toHaveTextContent("Drink water");
  expect(stats).toHaveTextContent("Done on 2 days this week");
});

test("dots_week_only", async () => {
  await renderReview({ review_stats: (a) => reply(rangeOf(a)) });
  const stats = section("Stats");
  expect(dots(stats).length).toBeGreaterThan(0);
  // The legend has no role of its own: its slot is the only handle on "printed once".
  expect(stats.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(1);
  fireEvent.click(within(stats).getByRole("radio", { name: "8 weeks" }));
  await settle();
  expect(stats).toHaveTextContent("14h of focus over 8 weeks.");
  expect(stats).toHaveTextContent("Done on 20 days in 8 weeks");
  expect(records(stats)).toHaveLength(0);
  expect(dots(stats)).toHaveLength(0);
  expect(stats.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(0);
});

test("refresh_on_timer_milestone_ended", async () => {
  let focus = "2h 10m of focus this week.";
  const { backend } = await renderReview({
    review_stats: () => statsView({ summary: [focus] }),
  });
  expect(argsOf(backend.calls, "review_stats")).toHaveLength(1);
  await emitMilestone({ kind: "started" });
  expect(argsOf(backend.calls, "review_stats")).toHaveLength(1);
  focus = "2h 35m of focus this week.";
  await emitMilestone({ kind: "ended", endReason: "completed" });
  await settle();
  expect(argsOf(backend.calls, "review_stats")).toHaveLength(2);
  expect(section("Stats")).toHaveTextContent("2h 35m of focus this week.");
});

test("stale_stats_reply_dropped", async () => {
  const first = deferred<StatsView_Serialize>();
  let calls = 0;
  const { backend } = await renderReview({
    review_stats: (a) => {
      calls += 1;
      return calls === 1 ? first.promise : reply(rangeOf(a));
    },
  });
  // The week read is still in flight when the person picks 8 weeks.
  fireEvent.click(within(section("Stats")).getByRole("radio", { name: "8 weeks" }));
  await settle();
  // One call in flight: the second waits for the first.
  expect(argsOf(backend.calls, "review_stats")).toHaveLength(1);
  await act(async () => {
    first.resolve(statsView({ summary: ["Late week reply."] }));
  });
  await settle();
  expect(argsOf(backend.calls, "review_stats")).toEqual([{ range: "week" }, { range: "weeks8" }]);
  const stats = section("Stats");
  expect(stats).not.toHaveTextContent("Late week reply.");
  expect(stats).toHaveTextContent("14h of focus over 8 weeks.");
});

test("stats_failure_is_a_plain_line_with_try_again", async () => {
  let fail = true;
  await renderReview({
    review_stats: () => (fail ? Promise.reject("store") : statsView()),
  });
  const stats = section("Stats");
  expect(stats).toHaveTextContent("Orasenda can't load your stats right now.");
  fail = false;
  fireEvent.click(within(stats).getByRole("button", { name: /^Try again/ }));
  await settle();
  expect(stats).not.toHaveTextContent("can't load your stats");
  expect(stats).toHaveTextContent("2h 10m of focus this week.");
});

test("empty_range_sentence_shows_once", async () => {
  const line = "Nothing recorded in this range yet.";
  await renderReview({
    review_stats: () => statsView({ summary: [line], empty: line, habits: [] }),
  });
  expect(within(section("Stats")).getAllByText(line)).toHaveLength(1);
});

test("repeated_lines_do_not_collide", async () => {
  const line = "Wind-down: finished 2 times.";
  await renderReview({ review_stats: () => statsView({ routines: [line, line] }) });
  expect(within(section("Stats")).getAllByText(line)).toHaveLength(2);
});

test.each([
  ["review-changed", () => events.reviewChanged.emit(reviewView())],
  ["routines-changed", () => events.routinesChanged.emit(routinesView())],
  ["board-changed", () => events.boardChanged.emit({ seq: 1, board: boardOf([]) })],
])("refresh_on_%s", async (_name, emit) => {
  const { backend } = await renderReview({ review_stats: () => statsView() });
  expect(argsOf(backend.calls, "review_stats")).toHaveLength(1);
  await act(async () => {
    await emit();
  });
  await settle();
  expect(argsOf(backend.calls, "review_stats")).toHaveLength(2);
});

const withBuffer = () =>
  statsView({
    buffer: { percent: 40, line: "A buffer of 40% would fit better.", action: "Use 40%" },
  });

test("use_buffer_moves_focus_to_the_heading", async () => {
  await renderReview({ review_stats: () => withBuffer() });
  const stats = section("Stats");
  fireEvent.click(within(stats).getByRole("button", { name: "Use 40%" }));
  await settle();
  expect(within(stats).getByRole("heading", { name: "Stats" })).toHaveFocus();
});

test("not_now_moves_focus_to_the_heading", async () => {
  await renderReview({ review_stats: () => withBuffer() });
  const stats = section("Stats");
  fireEvent.click(within(stats).getByRole("button", { name: "Not now" }));
  await settle();
  expect(within(stats).getByRole("heading", { name: "Stats" })).toHaveFocus();
});

test("use_buffer_save_failure_is_a_plain_line", async () => {
  await renderReview({
    review_stats: () => withBuffer(),
    settings_set: () => Promise.reject("store"),
  });
  const stats = section("Stats");
  await waitFor(() => expect(within(stats).getByRole("button", { name: "Use 40%" })).toBeVisible());
  fireEvent.click(within(stats).getByRole("button", { name: "Use 40%" }));
  await settle();
  expect(within(stats).getByText(/couldn.t save that right now/)).toBeVisible();
  expect(within(stats).getByRole("button", { name: "Use 40%" })).toBeVisible();
});

// Reviews spec :35 and canvas 4A (owner, 2026-11-18): one row per habit, one M–S header, the legend once after the list.
test("habit_rows_one_header_one_legend_after_list", async () => {
  const habits = [
    habitStat({ name: "Drink water", line: "Done on 2 days this week" }),
    habitStat({ name: "Stretch", line: "Done on 1 day this week" }),
    habitStat({ name: "Read one page", line: "Done on 2 days this week" }),
  ];
  await renderReview({ review_stats: () => statsView({ habits }) });
  const stats = section("Stats");
  const list = within(stats).getByRole("list", { name: "Habits" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(3);
  rows.forEach((row, index) => {
    const habit = habits[index];
    if (!habit) throw new Error("missing habit");
    // Each row holds its name, Rust's line and one daily record, and no header or legend of its own.
    expect(row).toHaveTextContent(habit.name);
    expect(row).toHaveTextContent(habit.line);
    expect(within(row).getAllByRole("group", { name: `${habit.name}, daily record` })).toHaveLength(
      1,
    );
    expect(row.querySelectorAll('[data-slot="habit-weekday"]')).toHaveLength(0);
    expect(row.querySelectorAll('[data-slot="habit-name"]')).toHaveLength(0);
    expect(row.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(0);
  });
  // One M–S header for the whole list, above the first row.
  const letters = stats.querySelectorAll('[data-slot="habit-weekday"]');
  expect(Array.from(letters, (l) => l.textContent).join("")).toBe("MTWTFSS");
  const first = rows[0] as HTMLElement;
  expect(letters[0]?.compareDocumentPosition(first)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  // The legend prints once, after the last habit, with words beside each shape.
  const legends = stats.querySelectorAll('[data-slot="habit-legend"]');
  expect(legends).toHaveLength(1);
  const legend = legends[0] as HTMLElement;
  expect(list.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(list.contains(legend)).toBe(false);
  expect(legend).toHaveTextContent("Done");
  expect(legend).toHaveTextContent("Not done");
});

test("habit_rows_without_dots_have_no_header_or_legend", async () => {
  const habits = [habitStat({ dots: null, line: "Done on 20 days in 8 weeks" })];
  await renderReview({ review_stats: () => statsView({ habits }) });
  const stats = section("Stats");
  expect(stats).toHaveTextContent("Done on 20 days in 8 weeks");
  expect(stats.querySelectorAll('[data-slot="habit-weekday"]')).toHaveLength(0);
  expect(stats.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(0);
});
