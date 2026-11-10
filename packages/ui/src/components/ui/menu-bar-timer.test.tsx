import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { MenuBarTimerProps } from "./menu-bar-timer";
import { MenuBarTimer } from "./menu-bar-timer";

const RUN = { remaining: "18:42", remainingLabel: "18 minutes 42 seconds" };

test("exposes_timer_role_with_name", () => {
  render(<MenuBarTimer {...RUN} mode="focus" task="Write chapter" />);
  const timer = screen.getByRole("timer", {
    name: "Focus, 18 minutes 42 seconds remaining, Write chapter",
  });
  expect(timer.getAttribute("aria-live")).toBe("off");
  expect(timer.getAttribute("data-slot")).toBe("menu-bar-timer");
});

test("renders_focus_with_ring_and_digits", () => {
  const { container } = render(<MenuBarTimer {...RUN} mode="focus" progress={0.25} />);
  expect(container.querySelector("[data-slot=menu-bar-timer-ring]")).not.toBeNull();
  expect(container.querySelector("[data-slot=menu-bar-timer-digits]")?.textContent).toBe("18:42");
  expect(screen.getByRole("timer").getAttribute("data-mode")).toBe("focus");
});

test("renders_warning_with_triangle_and_word", () => {
  const { container } = render(<MenuBarTimer {...RUN} mode="warning" />);
  expect(screen.getByRole("timer").getAttribute("aria-label")).toMatch(/^Almost up, /);
  expect(container.querySelector("svg.os-shape path")?.getAttribute("d")).toBe(
    "M5 0.5 9.6 9.5H0.4z",
  );
});

test("renders_break_with_half_circle_and_word", () => {
  const { container } = render(<MenuBarTimer {...RUN} mode="break" />);
  expect(screen.getByRole("timer").getAttribute("aria-label")).toMatch(/^Break, /);
  expect(container.querySelector("svg.os-shape path")?.getAttribute("d")).toBe(
    "M5 0a5 5 0 0 1 0 10z",
  );
});

test("renders_paused_with_bars_and_word", () => {
  const { container } = render(<MenuBarTimer {...RUN} mode="paused" />);
  expect(screen.getByRole("timer").getAttribute("aria-label")).toMatch(/^Paused, /);
  expect(container.querySelector("svg.os-shape path")?.getAttribute("d")).toBe(
    "M1 1h3v8H1zM6 1h3v8H6z",
  );
});

test("renders_idle_with_hollow_circle_and_no_digits", () => {
  const { container } = render(<MenuBarTimer mode="idle" remaining="18:42" />);
  expect(screen.getByRole("timer", { name: "No session" })).not.toBeNull();
  expect(container.querySelector("svg.os-shape circle")?.getAttribute("fill")).toBe("none");
  expect(container.querySelector("[data-slot=menu-bar-timer-digits]")).toBeNull();
});

test("falls_back_to_default_digits_and_label", () => {
  render(<MenuBarTimer />);
  expect(screen.getByRole("timer", { name: "Focus, 25:00 remaining" })).not.toBeNull();
  expect(screen.getByText("25:00")).not.toBeNull();
});

test("compact_hides_the_task_and_floating_shows_it", () => {
  const props: MenuBarTimerProps = { ...RUN, task: "Write chapter" };
  const { container, rerender } = render(<MenuBarTimer {...props} />);
  expect(container.querySelector("[data-slot=menu-bar-timer-task]")).toBeNull();
  expect(screen.getByRole("timer").getAttribute("data-compact")).toBe("true");
  rerender(<MenuBarTimer {...props} compact={false} />);
  const task = container.querySelector("[data-slot=menu-bar-timer-task]");
  expect(task?.textContent).toBe("Write chapter");
  expect(task?.getAttribute("aria-hidden")).toBe("true");
  expect(screen.getByRole("timer").getAttribute("data-compact")).toBe("false");
  expect(screen.getByRole("timer").getAttribute("aria-label")).toContain("Write chapter");
});

test("ring_drains_with_progress_and_clamps", () => {
  const offset = (progress: number) => {
    const { container, unmount } = render(<MenuBarTimer mode="focus" progress={progress} />);
    const value = Number(
      container
        .querySelector("[data-slot=menu-bar-timer-ring] [data-slot=menu-bar-timer-progress]")
        ?.getAttribute("stroke-dashoffset"),
    );
    unmount();
    return value;
  };
  const full = 2 * Math.PI * 5;
  expect(offset(0)).toBeCloseTo(0);
  expect(offset(0.25)).toBeCloseTo(full * 0.25);
  expect(offset(5)).toBeCloseTo(full);
  expect(offset(Number.NaN)).toBeCloseTo(0);
});
