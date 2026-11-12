import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NavRail } from "./nav-rail.tsx";

const LABELS = ["Today", "Board", "Calendar", "Routines", "Review", "Settings"];

test("nav_rail_exposes_navigation_with_name", () => {
  render(<NavRail current="today" onNavigate={() => {}} />);
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(nav.getAttribute("data-slot")).toBe("nav-rail");
  const names = within(nav)
    .getAllByRole("button")
    .map((b) => b.textContent);
  expect(names).toEqual(LABELS);
});

test("nav_rail_renders_current_with_word_or_shape", () => {
  render(<NavRail current="calendar" onNavigate={() => {}} />);
  const current = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-current"));
  expect(current.map((b) => b.textContent)).toEqual(["Calendar"]);
  expect(current[0]?.getAttribute("aria-current")).toBe("page");
});

test("nav_rail_icons_are_hidden_from_assistive_tech", () => {
  render(<NavRail current="today" onNavigate={() => {}} />);
  for (const button of screen.getAllByRole("button")) {
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  }
});

test("nav_rail_activation_navigates_to_the_page", () => {
  const onNavigate = vi.fn();
  render(<NavRail current="today" onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole("button", { name: "Routines" }));
  expect(onNavigate).toHaveBeenCalledWith("routines");
});

test("nav_rail_current_follows_the_prop", () => {
  const { rerender } = render(<NavRail current="today" onNavigate={() => {}} />);
  rerender(<NavRail current="settings" onNavigate={() => {}} />);
  expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-current")).toBe(
    "page",
  );
  expect(screen.getByRole("button", { name: "Today" }).hasAttribute("aria-current")).toBe(false);
});

test("nav_rail_current_label_is_semibold_like_legacy", () => {
  render(<NavRail current="board" onNavigate={() => {}} />);
  for (const button of screen.getAllByRole("button")) {
    const label = button.querySelector("span");
    expect(label?.classList.contains("font-semibold")).toBe(button.hasAttribute("aria-current"));
  }
});

function tabStops(): HTMLElement[] {
  return screen.getAllByRole("button").filter((b) => b.tabIndex === 0);
}

test("nav_rail_is_one_roving_tab_stop", () => {
  render(<NavRail current="board" onNavigate={() => {}} />);
  expect(tabStops().map((b) => b.textContent)).toEqual(["Board"]);
});

test("nav_rail_tab_stop_follows_current_page", () => {
  const { rerender } = render(<NavRail current="today" onNavigate={() => {}} />);
  expect(tabStops().map((b) => b.textContent)).toEqual(["Today"]);
  rerender(<NavRail current="review" onNavigate={() => {}} />);
  expect(tabStops().map((b) => b.textContent)).toEqual(["Review"]);
});

test("nav_rail_arrows_move_and_activation_navigates", () => {
  const onNavigate = vi.fn();
  render(<NavRail current="today" onNavigate={onNavigate} />);
  screen.getByRole("button", { name: "Today" }).focus();
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
  expect(document.activeElement?.textContent).toBe("Board");
  expect(tabStops().map((b) => b.textContent)).toEqual(["Board"]);
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
  expect(document.activeElement?.textContent).toBe("Board");
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
  expect(document.activeElement?.textContent).toBe("Settings");
  fireEvent.click(document.activeElement as Element);
  expect(onNavigate).toHaveBeenCalledWith("settings");
});

test("nav_rail_keeps_aria_current_page", () => {
  render(<NavRail current="routines" onNavigate={() => {}} />);
  const current = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-current"));
  expect(current.map((b) => b.textContent)).toEqual(["Routines"]);
});

test("nav_rail_icons_come_from_icon", () => {
  render(<NavRail current="today" onNavigate={() => {}} />);
  for (const button of screen.getAllByRole("button")) {
    expect(button.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.5");
    expect(button.querySelector("svg")?.classList.contains("size-icon-lg")).toBe(true);
  }
});
