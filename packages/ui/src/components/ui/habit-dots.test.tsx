import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { HabitDots, HabitLegend, HabitWeekdays } from "./habit-dots";

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

test("compact_week_shows_only_the_grid_and_keeps_its_name", () => {
  const { container } = render(
    <HabitDots compact name="Stretch" columns="week" days={["done", "skipped"]} runLine="1 day" />,
  );
  expect(container.querySelector('[data-slot="habit-name"]')).toBeNull();
  expect(container.querySelector('[data-slot="habit-weekday"]')).toBeNull();
  expect(container.querySelector('[data-slot="habit-run-line"]')).toBeNull();
  expect(screen.getByRole("group", { name: "Stretch, daily record" })).toBeInTheDocument();
  expect(screen.getAllByRole("img")).toHaveLength(2);
});

test("weekday_header_alone_is_aria_hidden_and_monday_first", () => {
  const { container } = render(<HabitWeekdays />);
  const letters = container.querySelectorAll('[data-slot="habit-weekday"]');
  expect(Array.from(letters, (l) => l.textContent).join("")).toBe("MTWTFSS");
  for (const l of letters) expect(l.getAttribute("aria-hidden")).toBe("true");
});

test("legend_alone_names_every_shape_in_words", () => {
  const { container } = render(<HabitLegend />);
  const legend = container.querySelector('[data-slot="habit-legend"]') as HTMLElement;
  for (const word of ["Done", "Not done", "Rest day", "Upcoming", "Today"]) {
    expect(legend).toHaveTextContent(word);
  }
  expect(screen.queryAllByRole("img")).toHaveLength(0);
});

const sevenDays = (extra: Record<string, unknown> = {}) =>
  Array.from({ length: 7 }, () => ({ state: "done" as const, ...extra }));
const classes = (el: Element) => Array.from(el.classList);

test("compact_dots_are_icon_sm_with_space_1_gaps", () => {
  const { container } = render(
    <HabitDots compact name="Stretch" columns="week" days={sevenDays()} />,
  );
  const dots = container.querySelectorAll('[data-slot="habit-dot"]');
  expect(dots).toHaveLength(7);
  for (const d of dots) {
    expect(d.className).toContain("size-icon-sm");
    expect(classes(d)).not.toContain("size-icon-md");
  }
  const grid = screen.getByRole("group", { name: "Stretch, daily record" });
  expect(classes(grid)).toContain("gap-1");
  expect(classes(grid)).not.toContain("gap-fluid-stack");
  expect(within(grid).getAllByRole("img")).toHaveLength(7);
});

test("non_compact_dots_stay_icon_md", () => {
  const { container } = render(
    <>
      <HabitDots name="Stretch" columns="week" days={sevenDays()} legend />
    </>,
  );
  for (const d of container.querySelectorAll(
    '[data-slot="habit-grid"] [data-slot="habit-dot"], [data-slot="habit-legend"] [data-slot="habit-dot"]',
  )) {
    expect(classes(d)).toContain("size-icon-md");
    expect(classes(d)).not.toContain("size-icon-sm");
  }
  const grid = screen.getByRole("group", { name: "Stretch, daily record" });
  expect(classes(grid)).toContain("gap-fluid-stack");
});

test("compact_today_ring_fits_the_gap", () => {
  const a = render(
    <HabitDots compact columns="week" days={[{ state: "done", today: true }]} />,
  );
  const dot = a.container.querySelector('[data-slot="habit-dot"]') as Element;
  expect(classes(dot)).toContain("outline-focus-ring");
  expect(classes(dot)).toContain("outline-offset-1");
  const b = render(<HabitDots columns="week" days={[{ state: "done", today: true }]} />);
  expect(classes(b.container.querySelector('[data-slot="habit-dot"]') as Element)).toContain(
    "outline-offset-3",
  );
});

test("compact_leading_gap_cells_are_icon_sm", () => {
  const { container } = render(
    <HabitDots compact columns="week" days={[{ state: "done", weekday: 2 }]} />,
  );
  const gaps = container.querySelectorAll('[data-slot="habit-gap"]');
  expect(gaps).toHaveLength(2);
  for (const g of gaps) expect(classes(g)).toContain("size-icon-sm");
});

test("weekday_header_cells_match_the_compact_cell", () => {
  const head = render(<HabitWeekdays />);
  for (const l of head.container.querySelectorAll('[data-slot="habit-weekday"]')) {
    expect(classes(l)).toContain("w-icon-sm");
  }
  const header = head.container.querySelector('[data-slot="habit-weekdays"]') as Element;
  const grid = render(<HabitDots compact name="Zed" columns="week" days={sevenDays()} />);
  const gridEl = grid.getByRole("group", { name: "Zed, daily record" });
  const gap = (el: Element) => classes(el).filter((c) => /^gap-/.test(c));
  expect(gap(header)).toEqual(["gap-1"]);
  expect(gap(gridEl)).toEqual(gap(header));
});

test("compact_shapes_differ_by_more_than_colour", () => {
  const { container } = render(
    <HabitDots
      compact
      columns="week"
      days={[{ state: "done" }, { state: "skipped" }, { state: "rest" }, { state: "future" }]}
    />,
  );
  const [done, skipped, rest, future] = Array.from(
    container.querySelectorAll('[data-slot="habit-dot"]'),
  );
  expect(classes(done as Element)).toContain("bg-break");
  expect((done as Element).textContent).toBe("✓");
  expect(classes(skipped as Element)).toContain("border-2");
  expect(classes(rest as Element)).toContain("border-dashed");
  expect(classes(future as Element)).toContain("border-dotted");
});
