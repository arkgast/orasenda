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
