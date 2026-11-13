import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TimerStrip } from "./timer-strip";

const run = { remaining: "1:48", remainingLabel: "1 minute 48 seconds", progress: 0.94 };

test("timer_strip_name_has_remaining_label_and_mode", () => {
  render(<TimerStrip mode="warning" {...run} />);
  expect(
    screen.getByRole("timer", {
      name: "Almost up, 1 minute 48 seconds remaining",
    }),
  ).toBeTruthy();
});

test("timer_strip_stacked_form", () => {
  const { container, rerender } = render(<TimerStrip mode="focus" {...run} stacked />);
  const root = container.querySelector("[data-slot=timer-strip]") as HTMLElement;
  expect(root.getAttribute("data-stacked")).toBe("true");
  const name = root.getAttribute("aria-label");
  rerender(<TimerStrip mode="focus" {...run} />);
  expect(container.querySelector("[data-stacked=true]")).toBeNull();
  expect(container.querySelector("[data-slot=timer-strip]")?.getAttribute("aria-label")).toBe(name);
});

test("timer_strip_idle_shows_idle_length", () => {
  const { container } = render(<TimerStrip mode="idle" idleLength="25 min" />);
  expect(container.querySelector("[data-slot=timer-strip-length]")?.textContent).toBe("25 min");
  expect(container.querySelector("[data-slot=timer-strip-digits]")).toBeNull();
  expect(container.querySelector("[data-slot=timer-strip-bar]")).toBeNull();
  expect(screen.getByRole("timer").getAttribute("aria-label")).toBe("No session, 25 min");
});

test.each([
  ["focus", "Focus"],
  ["break", "Break"],
  ["paused", "Paused"],
  ["warning", "Almost up"],
  ["idle", "No session"],
] as const)("timer_strip_every_mode_has_word_or_shape (%s)", (mode, word) => {
  const { container } = render(<TimerStrip mode={mode} {...run} idleLength="25 min" />);
  const chip = container.querySelector("[data-slot=mode-chip]") as HTMLElement;
  expect(chip.textContent).toBe(word);
  expect(chip.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  expect(container.querySelector("[data-slot=timer-strip-triangle]") !== null).toBe(
    mode === "warning",
  );
});

test("timer_strip_adds_no_live_region", () => {
  const { container } = render(<TimerStrip mode="focus" {...run} />);
  const root = container.querySelector("[role=timer]") as HTMLElement;
  expect(root.getAttribute("aria-live")).toBe("off");
  expect(container.querySelector("[role=status],[role=alert]")).toBeNull();
  for (const el of container.querySelectorAll("[aria-live]"))
    expect(el.getAttribute("aria-live")).toBe("off");
});

test("timer_strip_has_no_task_line", () => {
  const { container } = render(<TimerStrip mode="focus" {...run} />);
  expect(container.querySelector("[data-slot=timer-strip-task]")).toBeNull();
});
