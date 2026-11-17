import type { StatsRange, StatsView_Serialize } from "@shared/ipc/bindings";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import {
  argsOf,
  barView,
  deferred,
  emitMilestone,
  habitStat,
  settle,
  statsView,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
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

const dots = (root: HTMLElement) => root.querySelectorAll('[data-slot="habit-dot"]');

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
  expect(stats.querySelectorAll('[data-slot="habit-legend"]')).toHaveLength(1);
  fireEvent.click(within(stats).getByRole("radio", { name: "8 weeks" }));
  await settle();
  expect(stats).toHaveTextContent("14h of focus over 8 weeks.");
  expect(stats).toHaveTextContent("Done on 20 days in 8 weeks");
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
