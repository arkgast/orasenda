import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { HabitDots } from "./habit-dots";

test("renders_done_with_word_or_shape", () => {
  render(<HabitDots days={["done"]} />);
  expect(screen.getByRole("img", { name: "Done" })).toBeTruthy();
});

test("renders_skipped_with_word_or_shape", () => {
  render(<HabitDots days={["skipped"]} />);
  expect(screen.getByRole("img", { name: "Not done" })).toBeTruthy();
});

test("renders_rest_with_word_or_shape", () => {
  render(<HabitDots days={["rest"]} />);
  expect(screen.getByRole("img", { name: "Rest day" })).toBeTruthy();
});

test("renders_future_with_word_or_shape", () => {
  render(<HabitDots days={["future"]} />);
  expect(screen.getByRole("img", { name: "Upcoming" })).toBeTruthy();
});

test("renders_unknown_state_as_upcoming", () => {
  render(<HabitDots days={["nope" as never]} />);
  expect(screen.getByRole("img", { name: "Upcoming" })).toBeTruthy();
});

test("renders_today_with_date_label_in_name", () => {
  render(<HabitDots days={[{ state: "done", today: true, label: "Monday 9 November" }]} />);
  expect(screen.getByRole("img", { name: "Monday 9 November, Today, Done" })).toBeTruthy();
});

test("exposes_group_with_name", () => {
  render(<HabitDots name="Stretch" days={["done", "rest"]} />);
  const group = screen.getByRole("group", { name: "Stretch, daily record" });
  expect(within(group).getAllByRole("img")).toHaveLength(2);
  expect(screen.getByText("Stretch")).toBeTruthy();
});

test("exposes_group_with_default_name", () => {
  render(<HabitDots days={["done"]} />);
  expect(screen.getByRole("group", { name: "Habit, daily record" })).toBeTruthy();
});

test("renders_legend_with_words", () => {
  render(<HabitDots days={["done"]} legend />);
  for (const word of ["Done", "Not done", "Rest day", "Upcoming", "Today"]) {
    expect(screen.getAllByText(word).length).toBeGreaterThan(0);
  }
});

test("renders_notes_when_given", () => {
  render(
    <HabitDots
      days={["done"]}
      note="Two minutes"
      restartNote="Two days off. Today is a fresh start."
    />,
  );
  expect(screen.getByText("Two minutes")).toBeTruthy();
  expect(screen.getByText("Two days off. Today is a fresh start.")).toBeTruthy();
});

test("marks_today_independent_of_state", () => {
  const { container } = render(<HabitDots days={[{ state: "skipped", today: true }]} />);
  const dot = container.querySelector("[data-slot='habit-dot']");
  expect(dot?.getAttribute("data-state")).toBe("skipped");
  expect(dot?.hasAttribute("data-today")).toBe(true);
});

test("each_state_has_a_shape_not_colour_alone", () => {
  const { container } = render(<HabitDots days={["done", "skipped", "rest", "future"]} />);
  const dots = container.querySelectorAll("[data-slot='habit-dot']");
  const [done, skipped, rest, future] = Array.from(dots);
  expect(done.getAttribute("data-state")).toBe("done");
  expect(done.className).toContain("bg-break");
  expect(done.querySelector("span[aria-hidden='true']")?.textContent).toBe("✓");
  expect(skipped.className).toContain("border-2");
  expect(rest.className).toContain("border-dashed");
  expect(future.className).toContain("border-dotted");
});

test("legend_dots_are_decorative", () => {
  render(<HabitDots days={["done"]} legend />);
  expect(screen.getAllByRole("img")).toHaveLength(1);
});

test("renders_run_line_under_the_grid", () => {
  const { container } = render(<HabitDots days={["done", "done"]} runLine="5 days kept" />);
  const line = screen.getByText("5 days kept");
  expect(line.getAttribute("data-slot")).toBe("habit-run-line");
  expect(line.className).toContain("text-ink-muted");
  const grid = container.querySelector("[data-slot='habit-grid']");
  expect(grid?.nextElementSibling).toBe(line);
});

test("default_layout_has_no_weekday_header_or_gaps", () => {
  const { container } = render(<HabitDots days={[{ state: "done", weekday: 3 }]} />);
  expect(container.querySelector("[data-slot='habit-weekday']")).toBeNull();
  expect(container.querySelector("[data-slot='habit-gap']")).toBeNull();
  expect(container.querySelector("[data-slot='habit-grid']")?.className).toContain("flex-wrap");
});

test("week_layout_has_an_aria_hidden_monday_header", () => {
  const { container } = render(<HabitDots columns="week" days={["done", "rest"]} />);
  const cells = Array.from(container.querySelectorAll("[data-slot='habit-weekday']"));
  expect(cells.map((c) => c.textContent)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  // Each cell is hidden itself, not through a display: contents wrapper that WebKit may drop.
  for (const cell of cells) expect(cell.getAttribute("aria-hidden")).toBe("true");
  const grid = container.querySelector("[data-slot='habit-grid']");
  expect(Array.from(grid?.children ?? []).slice(0, 7)).toEqual(cells);
  expect(container.querySelector("[data-slot='habit-weekdays']")).toBeNull();
  expect(grid?.getAttribute("data-columns")).toBe("week");
  expect(grid?.className).toContain("grid-cols-7");
});

test("week_layout_leaves_a_leading_gap_for_the_first_weekday", () => {
  const days = Array.from({ length: 28 }, (_, i) => ({
    state: "done" as const,
    weekday: (2 + i) % 7,
  }));
  const { container } = render(<HabitDots name="Walk" columns="week" days={days} />);
  const gaps = container.querySelectorAll("[data-slot='habit-gap']");
  expect(gaps).toHaveLength(2);
  for (const gap of Array.from(gaps)) expect(gap.getAttribute("aria-hidden")).toBe("true");
  const group = screen.getByRole("group", { name: "Walk, daily record" });
  expect(within(group).getAllByRole("img", { name: "Done" })).toHaveLength(28);
});

test("week_layout_without_a_weekday_starts_on_monday", () => {
  const { container } = render(<HabitDots columns="week" days={["done"]} />);
  expect(container.querySelectorAll("[data-slot='habit-gap']")).toHaveLength(0);
});

test("week_layout_ignores_an_out_of_range_weekday", () => {
  const { container } = render(<HabitDots columns="week" days={[{ state: "done", weekday: 9 }]} />);
  expect(container.querySelectorAll("[data-slot='habit-gap']")).toHaveLength(0);
});

test("week_layout_dots_keep_their_labels", () => {
  render(
    <HabitDots
      columns="week"
      days={[{ state: "skipped", weekday: 0, label: "Monday 9 November" }]}
    />,
  );
  expect(screen.getByRole("img", { name: "Monday 9 November, Not done" })).toBeTruthy();
});
