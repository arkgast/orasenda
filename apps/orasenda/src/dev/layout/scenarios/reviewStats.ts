import type { BarView, StatsRange, StatsView_Serialize } from "@shared/ipc/bindings";
import { barView, habitStat, reviewView, statsView } from "@shared/test/fixtures/review";
import { habitDots } from "@shared/test/fixtures/routines";
import type { Handler } from "./backend";
import { backend } from "./backend";

export const REVIEW_STATS_SCENARIOS: Record<string, Handler> = {};

// Review > Stats. *reviewStatsWeeks* has a goal, a long habit name, a long sentence, a routine
// line and the buffer suggestion, on every range; *reviewStatsGap* has weeks with nothing in them
// and says so plainly, without counting the gap.

/** The Review backend, answering `review_stats` by range. */
function statsBackend(by: (range: StatsRange) => StatsView_Serialize): Handler {
  const base = backend({ replies: { review_get: () => reviewView() } });
  return (cmd, args) =>
    cmd === "review_stats" ? by((args as { range: StatsRange }).range) : base(cmd, args);
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function days(minutes: number[], today: number): BarView[] {
  return DAYS.map((label, i) => {
    const m = minutes[i] ?? 0;
    const future = i > today;
    return barView({
      label: i === today ? "Today" : label,
      spoken: `${label}, ${m > 0 ? `${m} minutes` : "nothing recorded"}`,
      minutes: future ? 0 : m,
      duration: m > 0 && !future ? `${Math.floor(m / 60)}h ${m % 60}m` : "",
      current: i === today,
      empty: future || m === 0,
    });
  });
}

function periods(labels: string[], minutes: number[]): BarView[] {
  return labels.map((label, i) => {
    const m = minutes[i] ?? 0;
    return barView({
      label,
      spoken: `${label}, ${m > 0 ? `${m} minutes` : "nothing recorded"}`,
      minutes: m,
      duration: m > 0 ? `${Math.floor(m / 60)}h ${m % 60}m` : "",
      current: i === labels.length - 1,
      empty: m === 0,
    });
  });
}

const LONG_HABIT = "Stretch and drink a full glass of water before the first meeting of the day";
const BUFFER = {
  percent: 40,
  line: "Over the last few weeks, tasks took more focus sessions than planned. A buffer of 40% would fit better.",
  action: "Use 40%",
};

REVIEW_STATS_SCENARIOS.reviewStatsWeeks = statsBackend((range) => {
  const goal = { minutes: 720, words: "Goal 12h", line: "9h 40m of a 12h goal." };
  const base = {
    routines: ["Wind-down: finished 6 times.", "Morning start: finished 4 times."],
    estimateLine:
      "6 finished tasks had an estimate: 14 sessions planned, 17 sessions of 5 minutes or more.",
    buffer: BUFFER,
  };
  if (range === "week") {
    return statsView({
      ...base,
      summary: ["9h 40m of focus this week, across 5 days.", "Most on Wednesday."],
      bars: days([130, 95, 180, 100, 75, 0, 0], 4),
      goal,
      habits: [
        habitStat({ name: LONG_HABIT, dots: habitDots(Array(28).fill("done")) }),
        habitStat({ name: "Read", line: "Done on 3 days this week" }),
      ],
    });
  }
  if (range === "weeks8") {
    return statsView({
      ...base,
      range,
      summary: ["52h of focus over 8 weeks."],
      bars: periods(
        ["22 Sep", "29 Sep", "6 Oct", "13 Oct", "20 Oct", "27 Oct", "3 Nov", "This week"],
        [400, 520, 610, 300, 700, 540, 480, 580],
      ),
      goal,
      habits: [habitStat({ name: LONG_HABIT, dots: null, line: "Done on 31 days in 8 weeks" })],
    });
  }
  return statsView({
    ...base,
    range,
    summary: ["170h of focus over 6 months."],
    bars: periods(
      ["Jun", "Jul", "Aug", "Sep", "Oct", "This month"],
      [1500, 1800, 900, 2200, 2400, 1300],
    ),
    habits: [habitStat({ name: "Read", dots: null, line: "Done on 74 days in 6 months" })],
  });
});

REVIEW_STATS_SCENARIOS.reviewStatsGap = statsBackend((range) => {
  const quiet = "Nothing recorded in this range yet.";
  if (range === "week") {
    return statsView({
      summary: [quiet],
      bars: days([0, 0, 0, 0, 0, 0, 0], 2),
      habits: [],
      empty: null,
    });
  }
  return statsView({
    range,
    summary: [quiet],
    bars: periods(
      range === "weeks8"
        ? ["22 Sep", "29 Sep", "6 Oct", "13 Oct", "20 Oct", "27 Oct", "3 Nov", "This week"]
        : ["Jun", "Jul", "Aug", "Sep", "Oct", "This month"],
      [],
    ),
    habits: [],
    empty: "Stats appear after your first focus session.",
  });
});
