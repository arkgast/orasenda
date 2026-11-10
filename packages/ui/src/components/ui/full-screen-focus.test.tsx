import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FullScreenFocus } from "./full-screen-focus";

const base = {
  remaining: "18:42",
  remainingLabel: "18 minutes 42 seconds",
  progress: 0.25,
  mode: "focus" as const,
  task: "Draft the outline",
  clock: "09:41",
};

test("full_screen_focus_exposes_region_with_name", () => {
  render(<FullScreenFocus {...base} onExit={() => {}} />);
  const region = screen.getByRole("region", { name: "Full-screen focus" });
  expect(region.getAttribute("data-slot")).toBe("full-screen-focus");
});

test("full_screen_focus_renders_running_ring_with_word", () => {
  render(<FullScreenFocus {...base} onExit={() => {}} />);
  const timer = screen.getByRole("timer");
  expect(timer).toHaveAccessibleName(/Focus, 18 minutes 42 seconds remaining/);
  expect(within(timer).getByText("18:42")).toBeTruthy();
});

test("full_screen_focus_renders_paused_with_word", () => {
  render(<FullScreenFocus {...base} mode="paused" onExit={() => {}} />);
  expect(screen.getByRole("timer")).toHaveAccessibleName(/^Paused,/);
});

test("full_screen_focus_takes_focus_on_mount", () => {
  render(<FullScreenFocus {...base} onExit={() => {}} />);
  expect(document.activeElement).toBe(screen.getByLabelText("Full-screen focus"));
});

test("full_screen_focus_leave_button_opens_confirmation_and_exit_waits", () => {
  const onExit = vi.fn();
  render(<FullScreenFocus {...base} onExit={onExit} />);
  fireEvent.click(screen.getByRole("button", { name: "Leave full screen" }));
  const dialog = screen.getByRole("dialog", { name: "Leave full screen?" });
  expect(dialog).toHaveAccessibleDescription("Your focus session will keep running.");
  expect(onExit).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Leave full screen" }));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("full_screen_focus_stay_focused_closes_without_exit", () => {
  const onExit = vi.fn();
  render(<FullScreenFocus {...base} onExit={onExit} />);
  fireEvent.click(screen.getByRole("button", { name: "Leave full screen" }));
  fireEvent.click(screen.getByRole("button", { name: "Stay focused" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onExit).not.toHaveBeenCalled();
});

test("full_screen_focus_escape_asks_before_leaving", () => {
  const onExit = vi.fn();
  render(<FullScreenFocus {...base} onExit={onExit} />);
  fireEvent.keyDown(screen.getByLabelText("Full-screen focus"), { key: "Escape" });
  expect(screen.getByRole("dialog", { name: "Leave full screen?" })).toBeTruthy();
  expect(onExit).not.toHaveBeenCalled();
});

test("full_screen_focus_escape_in_dialog_stays_without_exit", () => {
  const onExit = vi.fn();
  render(<FullScreenFocus {...base} onExit={onExit} />);
  fireEvent.click(screen.getByRole("button", { name: "Leave full screen" }));
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Leave full screen?" }), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onExit).not.toHaveBeenCalled();
});

test("full_screen_focus_stay_focused_returns_focus_to_layout", () => {
  render(<FullScreenFocus {...base} onExit={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Leave full screen" }));
  fireEvent.click(screen.getByRole("button", { name: "Stay focused" }));
  expect(document.activeElement).toBe(screen.getByRole("region", { name: "Full-screen focus" }));
});
