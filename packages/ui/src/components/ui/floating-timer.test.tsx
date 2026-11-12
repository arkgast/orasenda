import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FloatingTimer, TALL_HEIGHT } from "./floating-timer";

const run = { remaining: "18:42", remainingLabel: "18 minutes 42 seconds", mode: "focus" as const };

test("floating_timer_pause_resume_and_open_buttons", () => {
  const onPause = vi.fn();
  const onResume = vi.fn();
  const onOpen = vi.fn();
  const view = render(
    <FloatingTimer {...run} onPause={onPause} onResume={onResume} onOpen={onOpen} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
  fireEvent.click(screen.getByRole("button", { name: "Open Orasenda" }));
  expect(onPause).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledTimes(1);
  view.rerender(
    <FloatingTimer {...run} mode="paused" onPause={onPause} onResume={onResume} onOpen={onOpen} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Resume session" }));
  expect(onResume).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Pause session" })).toBeNull();
  expect(
    screen.getAllByRole("button").every((b) => b.getAttribute("data-slot") === "icon-button"),
  ).toBe(true);
});

test("floating_timer_idle_start_named_start_focus", () => {
  const onStart = vi.fn();
  render(<FloatingTimer mode="idle" onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Pause session" })).toBeNull();
  expect(screen.getByText("No session")).toBeTruthy();
  expect(screen.getByRole("group")).toHaveAccessibleName("Floating timer, No session");
});

test("floating_timer_passes_data_attributes_to_body", () => {
  render(<FloatingTimer {...run} data-tauri-drag-region="" data-extra="x" />);
  const body = screen.getByRole("group");
  expect(body.hasAttribute("data-tauri-drag-region")).toBe(true);
  expect(body.getAttribute("data-extra")).toBe("x");
});

test("floating_timer_ended_announced_once", () => {
  const view = render(<FloatingTimer {...run} />);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("");
  view.rerender(<FloatingTimer mode="idle" ended />);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Session ended.");
  expect(screen.getByRole("group")).toHaveAccessibleName("Floating timer, Session ended");
  expect(screen.getByRole("button", { name: "Start focus" })).toBeTruthy();
  const visible = within(screen.getByRole("group")).getAllByText("Session ended.");
  expect(visible.some((n) => n.getAttribute("aria-hidden") === "true")).toBe(true);
});

test("floating_timer_deep_shows_hours", () => {
  render(<FloatingTimer remaining="1:30:00" remainingLabel="1 hour 30 minutes" mode="focus" />);
  expect(screen.getByText("1:30:00")).toBeTruthy();
  expect(screen.getByRole("timer")).toHaveAccessibleName(/1 hour 30 minutes remaining/);
});

test("floating_timer_every_mode_has_word_or_shape", () => {
  for (const mode of ["focus", "paused", "warning", "break", "idle"] as const) {
    const { unmount } = render(<FloatingTimer {...run} mode={mode} />);
    const body = screen.getByRole("group");
    const shaped = body.querySelector(
      "[data-slot=menu-bar-timer-ring], [data-slot=menu-bar-timer-shape]",
    );
    expect(shaped, mode).not.toBeNull();
    unmount();
  }
});

test("floating_timer_has_no_close_button_and_task_stays_in_the_name", () => {
  render(<FloatingTimer {...run} task="Draft the outline" />);
  expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  expect(screen.getByRole("timer")).toHaveAccessibleName(/Draft the outline/);
});

test("floating_timer_every_mode_has_word_or_shape_including_ended", () => {
  render(<FloatingTimer mode="idle" ended />);
  const body = screen.getByRole("group");
  expect(
    body.querySelector("[data-slot=menu-bar-timer-ring], [data-slot=menu-bar-timer-shape]"),
  ).not.toBeNull();
  expect(
    within(body)
      .getAllByText("Session ended.")
      .some((n) => n.getAttribute("aria-hidden") === "true"),
  ).toBe(true);
});

test("floating_timer_state_word_uses_the_border_box_height", () => {
  const original = globalThis.ResizeObserver;
  let fire: (blockSize: number) => void = () => {};
  globalThis.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      fire = (blockSize) =>
        cb(
          [
            {
              borderBoxSize: [{ blockSize, inlineSize: 280 }],
              contentRect: { height: blockSize - 2 },
            } as unknown as ResizeObserverEntry,
          ],
          this,
        );
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  try {
    render(<FloatingTimer {...run} />);
    act(() => fire(TALL_HEIGHT - 1));
    expect(screen.queryByText("Focus", { selector: "[data-slot=floating-timer-word]" })).toBeNull();
    act(() => fire(TALL_HEIGHT));
    expect(screen.getByText("Focus", { selector: "[data-slot=floating-timer-word]" })).toBeTruthy();
  } finally {
    globalThis.ResizeObserver = original;
  }
});
