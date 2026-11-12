import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FloatingTimer } from "./floating-timer";

const brk = { remaining: "05:00", remainingLabel: "5 minutes", mode: "break" as const };

test("floating_timer_skip_break_in_pause_slot", () => {
  const onSkipBreak = vi.fn();
  const onPause = vi.fn();
  const view = render(<FloatingTimer {...brk} onPause={onPause} onSkipBreak={onSkipBreak} />);
  fireEvent.click(screen.getByRole("button", { name: "Skip break" }));
  expect(onSkipBreak).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Pause session" })).toBeNull();
  const names = screen
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent);
  expect(names).toEqual(["Skip break", "Open Orasenda"]);
  // Without the prop, or outside a break, Pause keeps its slot.
  view.rerender(<FloatingTimer {...brk} onPause={onPause} />);
  expect(screen.getByRole("button", { name: "Pause break" })).toBeTruthy();
  view.rerender(
    <FloatingTimer
      remaining="18:42"
      remainingLabel="18 minutes"
      mode="focus"
      onSkipBreak={onSkipBreak}
    />,
  );
  expect(screen.queryByRole("button", { name: "Skip break" })).toBeNull();
});

test("floating_timer_keep_going_in_start_slot", () => {
  const onKeepGoing = vi.fn();
  const onStart = vi.fn();
  const view = render(
    <FloatingTimer
      mode="idle"
      onStart={onStart}
      onKeepGoing={onKeepGoing}
      keepGoingName="Steady Focus"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Keep going with Steady Focus" }));
  expect(onKeepGoing).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Start focus" })).toBeNull();
  expect(screen.getByRole("button", { name: "Keep going with Steady Focus" })).toHaveTextContent(
    "Keep going",
  );
  view.rerender(<FloatingTimer mode="idle" onStart={onStart} onKeepGoing={onKeepGoing} />);
  expect(screen.getByRole("button", { name: "Keep going" })).toBeTruthy();
  view.rerender(<FloatingTimer mode="idle" onStart={onStart} />);
  expect(screen.getByRole("button", { name: "Start focus" })).toBeTruthy();
});

test("floating_timer_skip_break_in_last_two_minutes_and_resume_when_paused", () => {
  const onSkipBreak = vi.fn();
  const onResume = vi.fn();
  const view = render(
    <FloatingTimer {...brk} mode="warning" phase="break" onSkipBreak={onSkipBreak} />,
  );
  expect(screen.getByRole("button", { name: "Skip break" })).toBeTruthy();
  view.rerender(
    <FloatingTimer
      {...brk}
      mode="paused"
      phase="break"
      onSkipBreak={onSkipBreak}
      onResume={onResume}
    />,
  );
  expect(screen.queryByRole("button", { name: "Skip break" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Resume break" }));
  expect(onResume).toHaveBeenCalledTimes(1);
  // A focus warning keeps Pause even if the host passes the prop.
  view.rerender(<FloatingTimer {...brk} mode="warning" onSkipBreak={onSkipBreak} />);
  expect(screen.getByRole("button", { name: "Pause session" })).toBeTruthy();
});
