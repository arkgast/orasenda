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
