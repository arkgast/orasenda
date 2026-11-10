import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IconButton, Kbd } from "../../index";
import { Tooltip } from "./tooltip";

const panel = () => document.querySelector<HTMLElement>("[data-slot=tooltip]");
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.style.setProperty("--duration-quick", "160ms");
  fireEvent.pointerDown(document.body);
});
afterEach(() => {
  vi.useRealTimers();
});

function Preset() {
  return (
    <Tooltip label="Change preset" shortcut="P">
      <button type="button">Classic · ends 15:20</button>
    </Tooltip>
  );
}

test("tooltip_shows_on_hover_after_duration_quick", () => {
  render(<Preset />);
  const trigger = screen.getByRole("button");
  fireEvent.pointerEnter(trigger);
  advance(159);
  expect(panel()).toBeNull();
  advance(1);
  expect(panel()?.textContent).toContain("Change preset");
});

test("tooltip_shows_on_focus_only_after_keyboard_event", () => {
  render(<Preset />);
  const trigger = screen.getByRole("button");
  act(() => trigger.focus());
  expect(panel()).toBeNull();
  act(() => trigger.blur());
  fireEvent.keyDown(document, { key: "Tab" });
  act(() => trigger.focus());
  expect(panel()?.textContent).toContain("Change preset");
});

test("tooltip_panel_and_kbd_are_aria_hidden", () => {
  render(<Preset />);
  fireEvent.pointerEnter(screen.getByRole("button"));
  advance(1000);
  expect(panel()?.getAttribute("aria-hidden")).toBe("true");
  expect(panel()?.querySelector("[data-slot=kbd]")).not.toBeNull();
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("tooltip_esc_hides", () => {
  render(<Preset />);
  const trigger = screen.getByRole("button");
  fireEvent.keyDown(document, { key: "Tab" });
  act(() => trigger.focus());
  expect(panel()).not.toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(panel()).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("tooltip_stays_while_hovered", () => {
  render(<Preset />);
  const trigger = screen.getByRole("button");
  fireEvent.pointerEnter(trigger);
  advance(160);
  const p = panel();
  expect(p).not.toBeNull();
  fireEvent.pointerLeave(trigger);
  advance(100);
  fireEvent.pointerEnter(p as Element);
  advance(500);
  expect(panel()).not.toBeNull();
  fireEvent.pointerLeave(p as Element);
  advance(159);
  expect(panel()).not.toBeNull();
  advance(1);
  expect(panel()).toBeNull();
});

test("tooltip_renders_inside_nearest_open_dialog", () => {
  const { unmount } = render(<Preset />);
  fireEvent.pointerEnter(screen.getByRole("button"));
  advance(160);
  // Radix wraps the panel in its own positioned element, so the body holds that wrapper.
  expect(panel()?.parentElement?.parentElement).toBe(document.body);
  unmount();

  render(
    <dialog open>
      <IconButton label="End session" icon={<span>x</span>} shortcut="⌘." />
    </dialog>,
  );
  fireEvent.pointerEnter(screen.getByRole("button", { name: "End session" }));
  advance(160);
  expect(panel()?.closest("dialog")).toBe(document.querySelector("dialog"));
});

test("tooltip_adds_no_live_region", () => {
  render(
    <>
      <Preset />
      <IconButton label="End session" icon={<span>x</span>} shortcut="⌘." />
      <p>
        <Kbd keys="P" spoken="P key" />
      </p>
    </>,
  );
  fireEvent.pointerEnter(screen.getByRole("button", { name: "End session" }));
  advance(160);
  expect(panel()).not.toBeNull();
  expect(document.querySelectorAll('[role="status"],[role="alert"],[aria-live]').length).toBe(0);
});
