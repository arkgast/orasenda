import { App } from "@app/App";
import { resetPresetsForTests } from "@domain/presets/presets";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { mockBackend, SETTINGS, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { PANES } from "./panes";
import { openSettings, pick } from "./Settings.support";
import type { SettingsTarget } from "./settingsTarget";

beforeEach(() => {
  resetPresetsForTests();
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
  Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
});

const navButton = (name: string) =>
  within(screen.getByRole("navigation", { name: "Settings" })).getByRole("button", { name });
const headings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

test("panes_lists_the_seven_ids_in_order", () => {
  expect(PANES.map((pane) => pane.id)).toEqual([
    "general",
    "timer",
    "notifications",
    "keyboard",
    "about",
    "data",
    "backups",
  ]);
  expect(PANES.map((pane) => pane.name)).toEqual([
    "General",
    "Timer",
    "Notifications",
    "Shortcuts",
    "About",
    "Your data",
    "Backups",
  ]);
});

test("opens_on_general", async () => {
  await openSettings();
  expect(headings()).toEqual(["General"]);
  expect(navButton("General")).toHaveAttribute("aria-current", "page");
});

test("pane_renders_alone", async () => {
  await openSettings();
  for (const pane of PANES) {
    pick(pane.name);
    await settle();
    expect(headings(), pane.name).toEqual([pane.name]);
    expect(navButton(pane.name)).toHaveAttribute("aria-current", "page");
    expect(document.querySelectorAll("section[aria-labelledby]")).toHaveLength(1);
  }
});

test("every_pane_is_reachable_from_the_nav", async () => {
  await openSettings();
  const nav = within(screen.getByRole("navigation", { name: "Settings" }));
  expect(nav.getAllByRole("button").map((b) => b.textContent)).toEqual(PANES.map((p) => p.name));
  expect(nav.queryByRole("button", { name: /Apps and sites/ })).toBeNull();
});

test("pointer_change_keeps_nav_focus", async () => {
  await openSettings();
  const item = navButton("Timer");
  fireEvent.click(item, { detail: 1 });
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Timer" })).not.toHaveFocus();
  expect(navButton("Timer")).toHaveFocus();
});

test("keyboard_change_focuses_heading", async () => {
  await openSettings();
  fireEvent.click(navButton("Notifications"), { detail: 0 });
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Notifications" })).toHaveFocus();
});

test("pane_scroll_resets", async () => {
  await openSettings();
  const region = document.querySelector<HTMLElement>('[data-slot="scroll-region"]');
  if (!region) throw new Error("no scroll region");
  region.scrollTop = 120;
  pick("Timer");
  await settle();
  expect(region.scrollTop).toBe(0);
});

async function arrive(target: SettingsTarget | undefined) {
  const { Settings: Page } = await import("./Settings");
  mockBackend({ settings_get: () => SETTINGS });
  render(<Page info={{ status: "loading" }} arrival={{ seq: 1, target }} onNavigate={() => {}} />);
  await settle();
}

const HEADING_TARGETS: Array<[SettingsTarget, string]> = [
  ["general", "General"],
  ["timer", "Timer"],
  ["notifications", "Notifications"],
  ["keyboard", "Shortcuts"],
  ["about", "About"],
  ["data", "Your data"],
  ["backups", "Backups"],
];

test.each(HEADING_TARGETS)("target_opens_pane_and_field_%s", async (target, name) => {
  await arrive(target);
  expect(headings()).toEqual([name]);
  expect(screen.getByRole("heading", { level: 2, name })).toHaveFocus();
});

test.each(["focusMinutes", "breakMinutes"] as const)(
  "target_opens_pane_and_field_%s",
  async (target) => {
    await arrive(target);
    expect(headings()).toEqual(["Timer"]);
    const selected = document.querySelector<HTMLElement>('input[id^="preset-"]:checked');
    expect(selected).not.toBeNull();
    expect(document.activeElement?.id).toBe(selected?.id.replace(/-radio$/, "-edit"));
    expect(document.activeElement).toHaveAccessibleName(/^Edit /);
  },
);

test("target_opens_pane_and_field_keepGoing", async () => {
  await arrive("keepGoing");
  expect(headings()).toEqual(["Timer"]);
  expect(screen.getByRole("checkbox", { name: "Keep going automatically" })).toHaveFocus();
});

test("no_target_opens_general_with_the_title_focused", async () => {
  await arrive(undefined);
  expect(headings()).toEqual(["General"]);
  expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toHaveFocus();
});

test("a_new_arrival_with_a_target_moves_to_its_pane", async () => {
  const { Settings: Page } = await import("./Settings");
  mockBackend({ settings_get: () => SETTINGS });
  const props = { info: { status: "loading" } as const, onNavigate: () => {} };
  const { rerender } = render(<Page {...props} arrival={{ seq: 1, target: "timer" }} />);
  await settle();
  pick("About");
  await settle();
  rerender(<Page {...props} arrival={{ seq: 2, target: "timer" }} />);
  await settle();
  expect(headings()).toEqual(["Timer"]);
  expect(screen.getByRole("heading", { level: 2, name: "Timer" })).toHaveFocus();
});

test("the_save_line_stays_while_the_pane_changes", async () => {
  await openSettings();
  const line = screen.getAllByRole("status")[0];
  pick("Backups");
  await settle();
  expect(screen.getAllByRole("status")[0]).toBe(line);
});

test("compact_width_uses_the_tab_strip_and_still_opens_a_pane", async () => {
  Object.assign(window, { innerWidth: 360, innerHeight: 240 });
  mockBackend();
  render(<App />);
  await settle();
  fireEvent.keyDown(document.body, { key: "6", metaKey: true });
  await settle();
  expect(screen.getByRole("navigation", { name: "Settings" })).toHaveAttribute(
    "data-orientation",
    "horizontal",
  );
  pick("Your data");
  await settle();
  expect(headings()).toEqual(["Your data"]);
});
