import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { type TrendBar, TrendBars } from "./trend-bars";

const bar = (over: Partial<TrendBar> = {}): TrendBar => ({
  label: "Mon",
  spoken: "Monday, 1 hour",
  minutes: 60,
  duration: "1h 0m",
  current: false,
  empty: false,
  ...over,
});

const week: TrendBar[] = [
  bar({ label: "Mon", spoken: "Monday, 1 hour", minutes: 60 }),
  bar({ label: "Tue", spoken: "Tuesday, 2 hours", minutes: 120 }),
  bar({ label: "Today", spoken: "Today, 30 minutes", minutes: 30, current: true }),
  bar({ label: "Thu", spoken: "Thursday, nothing yet", minutes: 0, empty: true }),
];

const marks = (c: HTMLElement) => c.querySelectorAll<HTMLElement>("[data-slot='trend-bar-fill']");
const stubs = (c: HTMLElement) => c.querySelectorAll<HTMLElement>("[data-slot='trend-bar-stub']");

test("trend_bars_figure_and_caption", () => {
  render(<TrendBars bars={week} caption="Focus time this week" />);
  const figure = screen.getByRole("figure", { name: "Focus time this week" });
  expect(within(figure).getByText("Focus time this week").tagName).toBe("FIGCAPTION");
});

test("trend_bars_spoken_list", () => {
  render(<TrendBars bars={week} caption="Focus time this week" />);
  const items = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(items.map((i) => i.textContent)).toEqual(week.map((b) => b.spoken));
});

test("trend_bars_marks_are_hidden_from_assistive_tech", () => {
  const { container } = render(<TrendBars bars={week} caption="c" />);
  expect(container.querySelector("[data-slot='trend-bars-plot']")?.getAttribute("aria-hidden")).toBe("true");
});

test("trend_bars_empty_draws_label_only", () => {
  const { container } = render(
    <TrendBars bars={week} goal={{ minutes: 120, words: "Goal 2h" }} caption="c" />,
  );
  expect(marks(container)).toHaveLength(3);
  // Stubs belong to the three periods with a mark, none to the empty one.
  expect(stubs(container)).toHaveLength(6);
  expect(screen.getByText("Thu")).toBeTruthy();
  const empty = container.querySelector("[data-empty]");
  expect(empty?.querySelector("[data-slot='trend-bar-fill']")).toBeNull();
});

test("trend_bars_scale_to_top_bar", () => {
  const { container } = render(<TrendBars bars={week} caption="c" />);
  const heights = [...marks(container)].map((m) => m.style.height);
  expect(heights).toEqual(["50%", "100%", "25%"]);
});

test("trend_bars_scale_to_goal", () => {
  const { container } = render(
    <TrendBars bars={week} goal={{ minutes: 240, words: "Goal 4h" }} caption="c" />,
  );
  expect([...marks(container)].map((m) => m.style.height)).toEqual(["25%", "50%", "12.5%"]);
  expect([...stubs(container)].every((s) => s.style.bottom === "100%")).toBe(true);
  expect(screen.getAllByText("Goal 4h")).toHaveLength(1);
});

test("trend_bars_goal_below_top_bar_keeps_stubs_inside_plot", () => {
  const { container } = render(
    <TrendBars bars={week} goal={{ minutes: 60, words: "Goal 1h" }} caption="c" />,
  );
  expect([...stubs(container)].every((s) => s.style.bottom === "50%")).toBe(true);
});

test("trend_bars_current_is_word", () => {
  const { container } = render(<TrendBars bars={week} caption="c" />);
  const label = screen.getByText("Today");
  expect(label.className).toContain("font-semibold");
  expect(container.querySelectorAll("[data-current]")).toHaveLength(1);
});

test("all_empty_without_goal_draws_no_marks", () => {
  const empty = week.map((b) => ({ ...b, minutes: 0, empty: true }));
  const { container } = render(<TrendBars bars={empty} caption="c" />);
  expect(marks(container)).toHaveLength(0);
  expect(stubs(container)).toHaveLength(0);
  expect(screen.getByText("Mon")).toBeTruthy();
});

test("trend_bars_nothing_focusable", () => {
  const { container } = render(
    <TrendBars bars={week} goal={{ minutes: 120, words: "Goal 2h" }} caption="c" />,
  );
  expect(container.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
});

test("trend_bars_no_animation", () => {
  const { container } = render(<TrendBars bars={week} caption="c" />);
  expect(container.innerHTML).not.toMatch(/transition|animate/);
});
