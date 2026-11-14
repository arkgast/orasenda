import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SettingsNav } from "./settings-nav.tsx";

const ITEMS = [
  { id: "general", name: "General" },
  { id: "timer", name: "Timer" },
  { id: "notifications", name: "Notifications" },
];

function setup(orientation: "vertical" | "horizontal" = "vertical", current = "timer") {
  const onSelect = vi.fn();
  render(
    <SettingsNav items={ITEMS} current={current} onSelect={onSelect} orientation={orientation} />,
  );
  const buttons = ITEMS.map((i) => screen.getByRole("button", { name: i.name }));
  return { onSelect, buttons };
}

test("settings_nav_is_a_named_nav_of_buttons", () => {
  setup();
  const nav = screen.getByRole("navigation", { name: "Settings" });
  expect(nav.getAttribute("data-slot")).toBe("settings-nav");
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "General",
    "Timer",
    "Notifications",
  ]);
});

test("settings_nav_aria_current", () => {
  setup();
  const marked = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-current"));
  expect(marked.map((b) => b.textContent)).toEqual(["Timer"]);
  expect(marked[0]?.getAttribute("aria-current")).toBe("page");
});

test("settings_nav_roving_tab_stop_on_current", () => {
  const { buttons } = setup();
  expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
});

test("settings_nav_arrows_move", () => {
  const { buttons } = setup();
  buttons[1]?.focus();
  fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[2]);
  fireEvent.keyDown(buttons[2] as HTMLElement, { key: "ArrowUp" });
  expect(document.activeElement).toBe(buttons[1]);
  fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowRight" });
  expect(document.activeElement).toBe(buttons[1]);
});

test("settings_nav_horizontal_arrows", () => {
  const { buttons } = setup("horizontal");
  buttons[1]?.focus();
  fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowRight" });
  expect(document.activeElement).toBe(buttons[2]);
  fireEvent.keyDown(buttons[2] as HTMLElement, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(buttons[1]);
  fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[1]);
});

test("settings_nav_home_end", () => {
  const { buttons } = setup();
  buttons[1]?.focus();
  fireEvent.keyDown(buttons[1] as HTMLElement, { key: "End" });
  expect(document.activeElement).toBe(buttons[2]);
  fireEvent.keyDown(buttons[2] as HTMLElement, { key: "Home" });
  expect(document.activeElement).toBe(buttons[0]);
});

test("settings_nav_arrows_do_not_select", () => {
  const { onSelect, buttons } = setup();
  buttons[1]?.focus();
  fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowDown" });
  expect(onSelect).not.toHaveBeenCalled();
});

test("settings_nav_via_pointer_vs_keyboard", () => {
  const { onSelect, buttons } = setup();
  fireEvent.click(buttons[0] as HTMLElement, { detail: 1 });
  expect(onSelect).toHaveBeenLastCalledWith("general", "pointer");
  fireEvent.click(buttons[2] as HTMLElement, { detail: 0 });
  expect(onSelect).toHaveBeenLastCalledWith("notifications", "keyboard");
});

test("settings_nav_vertical_has_no_edge_buttons", () => {
  setup();
  expect(screen.queryByRole("button", { name: "Earlier panes" })).toBeNull();
});

test("settings_nav_edge_buttons_scroll", () => {
  setup("horizontal");
  const earlier = document.querySelector("[aria-label='Earlier panes']") as HTMLButtonElement;
  const more = document.querySelector("[aria-label='More panes']") as HTMLButtonElement;
  expect(earlier.tabIndex).toBe(-1);
  expect(more.tabIndex).toBe(-1);
  const strip = screen
    .getByRole("navigation", { name: "Settings" })
    .querySelector("[data-slot=settings-nav-strip]") as HTMLElement;
  Object.defineProperty(strip, "clientWidth", { value: 300 });
  const by = vi.fn();
  strip.scrollBy = by as unknown as typeof strip.scrollBy;
  Object.defineProperty(strip, "scrollWidth", { value: 900 });
  strip.scrollLeft = 100;
  fireEvent.scroll(strip);
  fireEvent.click(more);
  expect(by.mock.calls[0]?.[0].left).toBeGreaterThan(0);
  fireEvent.click(earlier);
  expect(by.mock.calls[1]?.[0].left).toBeLessThan(0);
});

test("settings_nav_holds_a_list_of_items", () => {
  setup();
  expect(screen.getByRole("list")).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
});

test("settings_nav_tab_stop_follows_a_new_current", () => {
  const { rerender } = render(
    <SettingsNav items={ITEMS} current="timer" onSelect={vi.fn()} orientation="vertical" />,
  );
  fireEvent.focus(screen.getByRole("button", { name: "General" }));
  expect(screen.getAllByRole("button").map((b) => b.tabIndex)).toEqual([0, -1, -1]);
  rerender(
    <SettingsNav items={ITEMS} current="notifications" onSelect={vi.fn()} orientation="vertical" />,
  );
  expect(screen.getAllByRole("button").map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
});

test("settings_nav_edge_scroll_is_instant_under_reduced_motion", () => {
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce") })) as never;
  try {
    render(
      <SettingsNav items={ITEMS} current="timer" onSelect={vi.fn()} orientation="horizontal" />,
    );
    const strip = document.querySelector("[data-slot=settings-nav-strip]") as HTMLElement;
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    Object.defineProperty(strip, "scrollWidth", { configurable: true, value: 900 });
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: 100 });
    fireEvent.scroll(strip);
    fireEvent.click(document.querySelector("[aria-label='More panes']") as HTMLElement);
    expect(scrollBy).toHaveBeenCalledWith({ left: 75, behavior: "auto" });
  } finally {
    window.matchMedia = original;
  }
});

test("settings_nav_edge_buttons_have_a_tooltip_and_stay_off_the_tab_order", () => {
  setup("horizontal");
  const more = document.querySelector("[aria-label='More panes']") as HTMLElement;
  expect(more.getAttribute("data-slot")).toBe("icon-button");
  expect(more.tabIndex).toBe(-1);
});

test("settings_nav_new_items_array_with_same_ids_keeps_the_strip", () => {
  const listen = vi.spyOn(window, "addEventListener");
  const resizes = () => listen.mock.calls.filter(([type]) => type === "resize").length;
  const props = { current: "timer", onSelect: vi.fn(), orientation: "horizontal" as const };
  const { rerender } = render(<SettingsNav items={ITEMS} {...props} />);
  const first = resizes();
  rerender(<SettingsNav items={ITEMS.map((i) => ({ ...i }))} {...props} />);
  expect(resizes()).toBe(first);
  rerender(<SettingsNav items={ITEMS.map((i) => ({ ...i, id: `${i.id}2` }))} {...props} />);
  expect(resizes()).toBeGreaterThan(first);
  listen.mockRestore();
});
