import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { BarList, BarRow } from "./bar-row";

const base = { label: "Focus", duration: "2h 10m", spoken: "Focus, 2 hours 10 minutes" };

function fill(container: HTMLElement) {
  return container.querySelector("[data-slot='bar-fill']") as HTMLElement;
}

test("bar_row_scales_to_max", () => {
  const { container } = render(<BarRow {...base} minutes={30} max={120} />);
  expect(fill(container).style.width).toBe("25%");
  expect(fill(container).className).toContain("bg-line-strong");
  expect(fill(container).className).toContain("h-bar-height");
  expect(container.querySelector("[data-slot='bar-track']")).toBeNull();
});

test("bar_row_longest_fills_and_overflow_is_capped", () => {
  const a = render(<BarRow {...base} minutes={120} max={120} />);
  expect(fill(a.container).style.width).toBe("100%");
  const b = render(<BarRow {...base} minutes={200} max={120} />);
  expect(fill(b.container).style.width).toBe("100%");
  const c = render(<BarRow {...base} minutes={5} max={0} />);
  expect(fill(c.container).style.width).toBe("0%");
});

test("bar_row_goal_scales_to_goal", () => {
  const goal = { minutes: 600, words: "Goal 10h" };
  const { container } = render(<BarRow {...base} minutes={150} max={900} goal={goal} />);
  expect(fill(container).style.width).toBe("25%");
  expect(fill(container).className).toContain("bg-focus");
  expect(
    container.querySelector("[data-slot='bar-track-line']")?.classList.contains("border-line"),
  ).toBe(true);
  expect(container.querySelectorAll("[data-slot='bar-goal-stub']")).toHaveLength(2);
});

test("bar_row_goal_past_goal_fills_only_the_track", () => {
  const goal = { minutes: 600, words: "Goal 10h, reached" };
  const { container } = render(<BarRow {...base} minutes={700} max={700} goal={goal} />);
  expect(fill(container).style.width).toBe("100%");
});

test("bar_row_renders_goal_words_verbatim", () => {
  render(
    <BarRow
      {...base}
      minutes={50}
      max={720}
      goal={{ minutes: 600, words: "Meta 10 h · alcanzada" }}
    />,
  );
  expect(screen.getByText("Meta 10 h · alcanzada")).toBeTruthy();
});

test("bar_row_not_focusable", () => {
  const { container } = render(<BarRow {...base} minutes={30} max={60} />);
  const li = screen.getByRole("listitem");
  expect(li.tagName).toBe("LI");
  expect(li.hasAttribute("tabindex")).toBe(false);
  expect(container.querySelector("[tabindex],button,a,input")).toBeNull();
});

test("bar_row_spoken_name", () => {
  render(<BarRow {...base} minutes={130} max={130} />);
  expect(screen.getByRole("listitem", { name: "Focus, 2 hours 10 minutes" })).toBeTruthy();
});

test("bar_row_shows_label_and_duration", () => {
  render(<BarRow {...base} minutes={130} max={130} />);
  expect(screen.getByText("Focus")).toBeTruthy();
  expect(screen.getByText("2h 10m").className).toContain("text-timer-sm");
});

test("bar_list_owns_the_columns", () => {
  const { container } = render(
    <BarList>
      <BarRow {...base} minutes={30} max={60} />
    </BarList>,
  );
  const ul = container.querySelector("ul") as HTMLElement;
  // jsdom normalises `minmax(0, 1fr)` to `minmax(0px, 1fr)`.
  expect(ul.style.gridTemplateColumns).toBe("fit-content(40%) minmax(0px, 1fr) auto");
  expect(ul.className).toContain("grid");
});

const goalProps = {
  label: "Focus",
  minutes: 580,
  max: 720,
  duration: "9h 40m",
  spoken: "Focus, 9 hours 40 minutes, goal 12 hours",
  goal: { minutes: 720, words: "Goal 12h" },
};

test("bar_row_goal_words_at_end_take_the_third_column", () => {
  const { container } = render(
    <BarList>
      <BarRow {...goalProps} goalWords="end" />
    </BarList>,
  );
  const li = screen.getByRole("listitem", { name: goalProps.spoken });
  const words = screen.getByText("Goal 12h");
  expect(words.getAttribute("data-slot")).toBe("bar-goal-words");
  expect(words.className).toContain("text-body-sm");
  expect(words.className).not.toContain("text-ink-muted");
  expect(li.className).toContain("text-body-sm");
  expect(li.children[2]).toBe(words);
  expect(screen.queryByText("9h 40m")).toBeNull();
  expect(li.children[1]?.querySelector("[data-slot='bar-goal-words']")).toBeNull();
  expect(container.querySelector("[data-slot='bar-track-line']")).not.toBeNull();
  expect(container.querySelectorAll("[data-slot='bar-goal-stub']")).toHaveLength(2);
});

test("bar_row_goal_words_default_under_the_track", () => {
  render(
    <BarList>
      <BarRow {...goalProps} />
    </BarList>,
  );
  const li = screen.getByRole("listitem", { name: goalProps.spoken });
  expect(li.children[1]?.querySelector("[data-slot='bar-goal-words']")).not.toBeNull();
  expect(li.children[2]?.textContent).toBe("9h 40m");
});

test("bar_row_goal_words_end_without_goal_draws_duration", () => {
  const { container } = render(<BarRow {...base} minutes={30} max={60} goalWords="end" />);
  expect(screen.getByText("2h 10m")).toBeTruthy();
  expect(container.querySelector("[data-slot='bar-goal-words']")).toBeNull();
});
