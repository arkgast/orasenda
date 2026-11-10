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
  render(<HabitDots days={["done"]} note="Two minutes" restartNote="Two days off. Today is a fresh start." />);
  expect(screen.getByText("Two minutes")).toBeTruthy();
  expect(screen.getByText("Two days off. Today is a fresh start.")).toBeTruthy();
});

test("marks_today_independent_of_state", () => {
  const { container } = render(<HabitDots days={[{ state: "skipped", today: true }]} />);
  const dot = container.querySelector("[data-slot='habit-dot']");
  expect(dot?.getAttribute("data-state")).toBe("skipped");
  expect(dot?.hasAttribute("data-today")).toBe(true);
});
