import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SettingsIndex, type SettingsIndexSection } from "./settings-index";

const sections: SettingsIndexSection[] = [
  { id: "general", name: "General", value: "System" },
  { id: "timer", name: "Timer", value: "25 minutes", problem: { text: "Check focus minutes" } },
  {
    id: "keyboard",
    name: "Keyboard",
    value: "Set",
    problem: { text: "Pick a new shortcut", alert: true },
  },
];

function setup(current = "general") {
  const onJump = vi.fn();
  render(<SettingsIndex sections={sections} current={current} onJump={onJump} />);
  return onJump;
}

test("exposes_navigation_with_name_and_a_button_per_section", () => {
  setup();
  const nav = screen.getByRole("navigation", { name: "Settings sections" });
  expect(nav.getAttribute("data-slot")).toBe("settings-index");
  expect(screen.getAllByRole("button")).toHaveLength(3);
  expect(screen.getByRole("button", { name: /General/ }).textContent).toContain("System");
});

test("renders_current_with_aria_current_location", () => {
  setup("timer");
  expect(screen.getByRole("button", { name: /Timer/ }).getAttribute("aria-current")).toBe(
    "location",
  );
  expect(screen.getByRole("button", { name: /General/ }).getAttribute("aria-current")).toBeNull();
});

test("renders_problem_in_words_with_glyph_only_when_alert", () => {
  setup();
  const timer = screen.getByRole("button", { name: /Timer/ });
  expect(timer.textContent).toContain("Check focus minutes");
  expect(timer.textContent).not.toContain("25 minutes");
  expect(timer.querySelector("svg")).toBeNull();
  const keyboard = screen.getByRole("button", { name: /Keyboard/ });
  expect(keyboard.textContent).toContain("Pick a new shortcut");
  expect(keyboard.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("keeps_one_roving_tab_stop_on_current", () => {
  setup("timer");
  const stops = screen.getAllByRole("button").filter((b) => b.tabIndex === 0);
  expect(stops).toHaveLength(1);
  expect(stops[0]?.textContent).toContain("Timer");
});

test("moves_focus_with_arrow_keys_wrapping", () => {
  setup();
  const [general, , keyboard] = screen.getAllByRole("button");
  general?.focus();
  fireEvent.keyDown(general as HTMLElement, { key: "ArrowUp" });
  expect(document.activeElement).toBe(keyboard);
  expect(keyboard?.tabIndex).toBe(0);
  fireEvent.keyDown(keyboard as HTMLElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(general);
});

test("jumps_on_click_and_return", () => {
  const onJump = setup();
  fireEvent.click(screen.getByRole("button", { name: /Timer/ }));
  expect(onJump).toHaveBeenLastCalledWith("timer");
  fireEvent.keyDown(screen.getByRole("button", { name: /Keyboard/ }), { key: "Enter" });
  expect(onJump).toHaveBeenLastCalledWith("keyboard");
});

const LEGACY_SECTIONS = [
  { id: "general", name: "General", value: "Match system" },
  { id: "timer", name: "Timer", value: "Classic · 25 / 5" },
  { id: "notifications", name: "Notifications", value: "Off in macOS" },
  { id: "keyboard", name: "Keyboard", value: "Set", problem: { text: "Not saved" } },
  { id: "about", name: "About and data", value: "Version unavailable" },
];

test("keeps_type_sizes_after_colour_merge", () => {
  setup();
  const button = screen.getByRole("button", { name: /General/ });
  expect(button.className).toContain("text-body");
  expect(button.className).toContain("text-ink");
  expect(button.querySelector(".text-body-sm")).not.toBeNull();
});

test("legacy_is_one_roving_tab_stop", () => {
  render(<SettingsIndex sections={LEGACY_SECTIONS} current="timer" onJump={() => {}} />);
  const items = screen.getAllByRole("button");
  expect(items.filter((i) => i.tabIndex === 0)).toHaveLength(1);
  expect(items[1]?.tabIndex).toBe(0);
  items[1]?.focus();
  fireEvent.keyDown(items[1] as HTMLElement, { key: "ArrowDown" });
  expect(items[2]).toHaveFocus();
  expect(items.filter((i) => i.tabIndex === 0)).toEqual([items[2]]);
  fireEvent.keyDown(items[2] as HTMLElement, { key: "ArrowUp" });
  expect(items[1]).toHaveFocus();
  expect(screen.getByText("Not saved")).toBeInTheDocument();
  expect(screen.getByText("Version unavailable")).toBeInTheDocument();
});

test("legacy_return_calls_on_jump_and_marks_current_location", () => {
  const onJump = vi.fn();
  render(<SettingsIndex sections={LEGACY_SECTIONS} current="timer" onJump={onJump} />);
  const items = screen.getAllByRole("button");
  expect(items.filter((i) => i.getAttribute("aria-current") === "location")).toEqual([items[1]]);
  fireEvent.keyDown(items[3] as HTMLElement, { key: "Enter" });
  expect(onJump).toHaveBeenCalledTimes(1);
  expect(onJump).toHaveBeenCalledWith("keyboard");
  fireEvent.click(items[0] as HTMLElement);
  expect(onJump).toHaveBeenLastCalledWith("general");
});

test("legacy_wraps_and_resets_tab_stop_when_current_changes", () => {
  const { rerender } = render(
    <SettingsIndex sections={LEGACY_SECTIONS} current="timer" onJump={() => {}} />,
  );
  const items = screen.getAllByRole("button");
  items[4]?.focus();
  fireEvent.keyDown(items[4] as HTMLElement, { key: "ArrowDown" });
  expect(items[0]).toHaveFocus();
  fireEvent.keyDown(items[0] as HTMLElement, { key: "ArrowUp" });
  expect(items[4]).toHaveFocus();
  expect(items.filter((i) => i.tabIndex === 0)).toEqual([items[4]]);
  rerender(<SettingsIndex sections={LEGACY_SECTIONS} current="general" onJump={() => {}} />);
  expect(items.filter((i) => i.tabIndex === 0)).toEqual([items[0]]);
});
