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
    habits: [habitStat({ dots: null, line: "Drink water: done on 20 days in these 8 weeks" })],
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
  expect(stats).toHaveTextContent("Drink water: done on 2 days this week");
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
  expect(stats).toHaveTextContent("Drink water: done on 20 days in these 8 weeks");
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

const GOAL = { minutes: 720, words: "Goal 12h", line: "9h 40m of a 12h goal." };
const habitsOf = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    habitStat({ name: `Habit ${i + 1}`, line: `Habit ${i + 1}: done on ${i + 1} days this week.` }),
  );

// Reviews spec :35 and canvas 4A (owner, 2026-11-18): one row per habit, one M–S header, the legend once after the list.
test.each([1, 8])("week_%i_habits_one_header_one_legend", async (count) => {
  const habits = habitsOf(count);
  await renderReview({ review_stats: () => statsView({ habits }) });
  const stats = section("Stats");
  const list = within(stats).getByRole("list", { name: "Habits" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(count);
  rows.forEach((row, index) => {
    const habit = habits[index];
    if (!habit) throw new Error("missing habit");
    // One line of text (Rust's sentence, which starts with the name) and one daily record.
    const paragraphs = row.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe(habit.line);
    expect(within(row).getAllByRole("group", { name: `${habit.name}, daily record` })).toHaveLength(
      1,
    );
    expect(row.querySelectorAll('[data-slot="habit-weekday"]')).toHaveLength(0);
    expect(row.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(0);
  });
  const letters = stats.querySelectorAll('[data-slot="habit-weekday"]');
  expect(Array.from(letters, (l) => l.textContent).join("")).toBe("MTWTFSS");
  const first = rows[0] as HTMLElement;
  expect(letters[0]?.compareDocumentPosition(first)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  const legends = stats.querySelectorAll('[data-slot="habit-legend"]');
  expect(legends).toHaveLength(1);
  const legend = legends[0] as HTMLElement;
  expect(list.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(list.contains(legend)).toBe(false);
  expect(legend).toHaveTextContent("Done");
  expect(legend).toHaveTextContent("Not done");
});

test("no_habit_name_printed_apart", async () => {
  const habits = habitsOf(3);
  await renderReview({ review_stats: () => statsView({ habits }) });
  const stats = section("Stats");
  const rows = within(within(stats).getByRole("list", { name: "Habits" })).getAllByRole("listitem");
  rows.forEach((row, index) => {
    expect(within(row).queryByText(habits[index]?.name ?? "")).toBeNull();
    expect(row.querySelectorAll('[data-slot="habit-name"]')).toHaveLength(0);
  });
  expect(within(stats).queryAllByText("Drink water")).toHaveLength(0);
});

test("zero_habits_no_list", async () => {
  await renderReview({ review_stats: () => statsView({ habits: [] }) });
  const stats = section("Stats");
  expect(within(stats).queryByRole("list", { name: "Habits" })).toBeNull();
  expect(stats.querySelectorAll('[data-slot="habit-weekday"]')).toHaveLength(0);
  expect(stats.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(0);
});

test("range_switch_shares_the_heading_row", async () => {
  await renderReview({ review_stats: () => statsView() });
  const stats = section("Stats");
  const heading = within(stats).getByRole("heading", { name: "Stats", level: 2 });
  const head = heading.parentElement as HTMLElement;
  expect(within(head).getByRole("radiogroup", { name: "Stats range" })).toBeInTheDocument();
  expect(head).not.toBe(stats);
});

test("week_goal_row_is_focus_with_words_at_end", async () => {
  await renderReview({ review_stats: () => statsView({ goal: GOAL }) });
  const stats = section("Stats");
  const list = within(stats).getByRole("list", { name: "Weekly goal" });
  const row = within(list).getByRole("listitem", { name: GOAL.line });
  expect(row).toHaveTextContent("Focus");
  expect(row).toHaveTextContent("Goal 12h");
  expect(row).not.toHaveTextContent("This week");
  // The li's aria-label is not text, so the caption is the only text match.
  const cap = within(stats).getByText(GOAL.line);
  expect(cap).toHaveAttribute("aria-hidden", "true");
  expect(list.contains(cap)).toBe(false);
  expect(list.compareDocumentPosition(cap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("week_without_goal_has_no_goal_row", async () => {
  await renderReview({ review_stats: () => statsView({ goal: null }) });
  const stats = section("Stats");
  expect(within(stats).queryByRole("list", { name: "Weekly goal" })).toBeNull();
  expect(stats.querySelectorAll('p[aria-hidden="true"]')).toHaveLength(0);
});

test("weeks8_lines_only", async () => {
  const habits = [
    habitStat({ dots: null, line: "Drink water: done on 20 days in these 8 weeks." }),
    habitStat({ name: "Stretch", dots: null, line: "Stretch: done on 9 days in these 8 weeks." }),
  ];
  await renderReview({
    review_stats: (a) =>
      rangeOf(a) === "week" ? statsView({ goal: GOAL }) : weeks8({ goal: GOAL, habits }),
  });
  const stats = section("Stats");
  fireEvent.click(within(stats).getByRole("radio", { name: "8 weeks" }));
  await settle();
  expect(within(stats).queryByRole("list", { name: "Weekly goal" })).toBeNull();
  const rows = within(within(stats).getByRole("list", { name: "Habits" })).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  rows.forEach((row, index) => {
    const paragraphs = row.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe(habits[index]?.line);
  });
  expect(records(stats)).toHaveLength(0);
  expect(stats.querySelectorAll('[data-slot="habit-weekday"]')).toHaveLength(0);
  expect(stats.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(0);
});

test("habit_rows_without_dots_have_no_header_or_legend", async () => {
  const habits = [habitStat({ dots: null, line: "Drink water: done on 20 days in these 8 weeks" })];
  await renderReview({ review_stats: () => statsView({ habits }) });
  const stats = section("Stats");
  expect(stats).toHaveTextContent("Drink water: done on 20 days in these 8 weeks");
  expect(stats.querySelectorAll('[data-slot="habit-weekday"]')).toHaveLength(0);
  expect(stats.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(0);
});
