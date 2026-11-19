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
const lines = (c: HTMLElement) =>
  c.querySelectorAll<HTMLElement>("[data-slot='trend-bar-goal-line']");
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
  expect(
    container.querySelector("[data-slot='trend-bars-plot']")?.getAttribute("aria-hidden"),
  ).toBe("true");
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
  expect([...lines(container)].every((s) => s.style.bottom === "100%")).toBe(true);
  expect(screen.getAllByText("Goal 4h")).toHaveLength(1);
});

test("trend_bars_goal_below_top_bar_keeps_stubs_inside_plot", () => {
  const { container } = render(
    <TrendBars bars={week} goal={{ minutes: 60, words: "Goal 1h" }} caption="c" />,
  );
  expect([...lines(container)].every((s) => s.style.bottom === "50%")).toBe(true);
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
  expect(container.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(
    0,
  );
});

test("trend_bars_no_animation", () => {
  const { container } = render(<TrendBars bars={week} caption="c" />);
  expect(container.innerHTML).not.toMatch(/transition|animate/);
});

const plotOf = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-slot='trend-bars-plot']");
const cols = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[data-slot='trend-bar']")];
const wordsOf = (t: string) => screen.getAllByText(t)[0] as HTMLElement;

test("caption_under_plot_names_figure", () => {
  const { container } = render(<TrendBars bars={week} caption="Focus time by week" />);
  const figure = screen.getByRole("figure", { name: "Focus time by week" });
  const cap = within(figure).getByText("Focus time by week");
  expect(figure.lastElementChild).toBe(cap);
  const plot = plotOf(container) as HTMLElement;
  expect(plot.compareDocumentPosition(cap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(cap.className).toContain("text-caption");
  expect(cap.className).toContain("text-ink-muted");
  expect(cap.className).not.toContain("text-body-sm");
});

test("columns_are_compact_and_start_aligned", () => {
  const { container } = render(<TrendBars bars={week} caption="c" />);
  for (const c of cols(container)) {
    expect(c.className).toContain("max-w-chart-column-width");
    expect(c.className).toContain("min-w-0");
    expect(c.className).not.toContain("flex-1");
  }
  const plot = plotOf(container)?.className ?? "";
  expect(plot).toContain("gap-5");
  expect(plot).not.toMatch(/justify-(between|around)/);
});

test("top_bar_leaves_headroom", () => {
  const { container } = render(<TrendBars bars={week} caption="c" />);
  for (const m of marks(container)) {
    const parent = m.parentElement as HTMLElement;
    expect(parent.getAttribute("data-slot")).toBe("trend-bar-scale");
    expect(parent.className).toContain("top-2");
    expect(m.className).toContain("rounded-pill");
    expect(m.className).not.toContain("rounded-sm");
  }
  expect([...marks(container)].map((m) => m.style.height)).toEqual(["50%", "100%", "25%"]);
});

test("goal_words_once_at_goal_height", () => {
  for (const [minutes, bottom] of [
    [240, "100%"],
    [60, "50%"],
  ] as const) {
    const { container, unmount } = render(
      <TrendBars bars={week} goal={{ minutes, words: "Goal 4h" }} caption="c" />,
    );
    expect(screen.getAllByText("Goal 4h")).toHaveLength(1);
    const w = wordsOf("Goal 4h");
    expect(w.style.bottom).toBe(bottom);
    const plot = plotOf(container) as HTMLElement;
    expect(plot.contains(w)).toBe(true);
    const last = cols(container).at(-1) as HTMLElement;
    expect(last.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(w.className).toContain("text-caption");
    expect(w.className).toContain("text-ink");
    unmount();
  }
});

test("goal_stubs_are_short_and_clear", () => {
  const { container } = render(
    <TrendBars bars={week} goal={{ minutes: 120, words: "Goal 2h" }} caption="c" />,
  );
  expect(stubs(container)).toHaveLength(6);
  for (const s of stubs(container)) {
    expect(s.className).toContain("w-1-5");
    expect(s.className).not.toContain("flex-1");
    expect(s.className).not.toContain("max-w-icon-sm");
  }
  for (const l of lines(container)) expect(l.className).toContain("gap-1");
});

test("empty_bar_draws_no_fill_and_no_stubs", () => {
  const { container } = render(
    <TrendBars bars={week} goal={{ minutes: 120, words: "Goal 2h" }} caption="c" />,
  );
  const empty = container.querySelector("[data-empty]") as HTMLElement;
  expect(empty.querySelector("[data-slot='trend-bar-fill']")).toBeNull();
  expect(empty.querySelector("[data-slot='trend-bar-stub']")).toBeNull();
  expect(empty.querySelector("[data-slot='trend-bar-goal-line']")).toBeNull();
  expect(within(empty).getByText("Thu")).toBeTruthy();
});

test("goal_without_bars", () => {
  const none = week.map((b) => ({ ...b, minutes: 0, empty: true }));
  const { container } = render(
    <TrendBars bars={none} goal={{ minutes: 120, words: "Goal 2h" }} caption="c" />,
  );
  expect(marks(container)).toHaveLength(0);
  expect(stubs(container)).toHaveLength(0);
  expect(screen.getAllByText("Goal 2h")).toHaveLength(1);
});

test("one_bar", () => {
  const { container } = render(<TrendBars bars={[bar()]} caption="c" />);
  expect([...marks(container)].map((m) => m.style.height)).toEqual(["100%"]);
});

test("eight_bars", () => {
  const eight = Array.from({ length: 8 }, (_, i) =>
    bar({ label: `W${i}`, spoken: `Week ${i}`, minutes: i < 2 ? 0 : 60, empty: i < 2 }),
  );
  const { container } = render(<TrendBars bars={eight} caption="c" />);
  expect(marks(container)).toHaveLength(6);
  expect(cols(container)).toHaveLength(8);
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(8);
});
