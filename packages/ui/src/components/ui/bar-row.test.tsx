import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { BarRow } from "./bar-row";

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
  expect(container.querySelector("[data-slot='bar-track']")?.className).toContain("border-line");
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
      minutes={720}
      max={720}
      goal={{ minutes: 720, words: "Goal 12h, reached" }}
    />,
  );
  expect(screen.getByText("Goal 12h, reached")).toBeTruthy();
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
