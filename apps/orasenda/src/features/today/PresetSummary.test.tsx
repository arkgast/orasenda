import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import {
  argsOf,
  emitClock,
  emitTimer,
  mockBackend,
  PAUSED,
  RUNNING,
  SETTINGS,
  settle,
} from "../../test/fixtures";
import { resetPresetsForTests } from "./presets";
import { Today } from "./Today";
import { renderToday } from "./Today.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetPresetsForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const summary = () => screen.getByRole("button", { name: /^Preset |^Presets unavailable/ });

test("summary_idle_text_name_tooltip", async () => {
  await renderToday();
  await emitClock({ idleFinish: "15:20" });
  const button = summary();
  expect(button).toHaveAccessibleName("Preset Classic, 25 minutes, ends 15:20. Change preset");
  expect(button).toHaveAttribute("aria-haspopup", "menu");
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(button.querySelector('[data-slot="preset-summary-full"]')).toHaveTextContent(
    "Classic · 25 min · ends 15:20",
  );
});

test("summary_running_ends_from_view_finish", async () => {
  await renderToday();
  await emitTimer(RUNNING);
  expect(summary()).toHaveAccessibleName("Preset Classic, ends 15:20. Preset details");
});

test("summary_paused_uses_planned_min", async () => {
  await renderToday();
  await emitTimer({ ...PAUSED, plannedMin: 50 });
  expect(summary()).toHaveAccessibleName("Preset Classic, 50 minutes, paused. Preset details");
});

test("summary_short_form_under_400", async () => {
  await renderToday();
  await emitClock({ idleFinish: "15:20" });
  const short = summary().querySelector('[data-slot="preset-summary-short"]');
  expect(short).toHaveTextContent("25 min · ends 15:20");
  expect(short).toHaveAttribute("aria-hidden", "true");
});

test("summary_settings_unavailable_disabled", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday({
    settings_get: () => {
      throw new Error("no store");
    },
  });
  const button = screen.getByRole("button", { name: "Presets unavailable" });
  expect(button).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(button);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("popover_idle_four_radios_metas", async () => {
  await renderToday();
  fireEvent.click(summary());
  const menu = screen.getByRole("menu", { name: "Preset for the next session" });
  expect(summary()).toHaveAttribute("aria-expanded", "true");
  expect(summary()).toHaveAttribute("aria-controls", menu.id);
  expect(menu).toHaveAccessibleDescription("Choosing one applies it and closes.");
  const radios = within(menu).getAllByRole("menuitemradio");
  expect(radios.map((radio) => radio.textContent)).toEqual([
    "Classic25 / 5",
    "50/1050 / 10",
    "Deep Block90 / 15",
    "Custom45 / 10",
  ]);
  expect(radios[0]).toHaveAttribute("aria-checked", "true");
  expect(within(menu).getByRole("menuitem", { name: /Edit times in Settings/ })).toHaveTextContent(
    "⌘,",
  );
});

test("popover_choose_saves_and_closes", async () => {
  const { backend } = await renderToday();
  fireEvent.click(summary());
  fireEvent.click(screen.getByRole("menuitemradio", { name: /50\/10/ }));
  await settle();
  expect(argsOf(backend.calls, "settings_set")).toEqual([
    { settings: { ...SETTINGS, preset: "fifty_ten" } },
  ]);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(summary()).toHaveAccessibleName(/^Preset 50\/10, 50 minutes/);
});

test("popover_running_read_only_heading", async () => {
  await renderToday();
  await emitTimer(RUNNING);
  fireEvent.click(summary());
  const menu = screen.getByRole("menu", { name: "Classic · 25 min" });
  expect(menu).toHaveAccessibleDescription("Presets can change between sessions.");
  for (const radio of within(menu).getAllByRole("menuitemradio")) {
    expect(radio).toHaveAttribute("aria-disabled", "true");
  }
  expect(within(menu).getByRole("menuitemradio", { name: /Classic/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(within(menu).getByRole("menuitem", { name: /Edit times in Settings/ })).not.toHaveAttribute(
    "aria-disabled",
  );
});

test("popover_quick_no_checked_radio", async () => {
  await renderToday();
  await emitTimer({ ...RUNNING, preset: "quick", plannedMin: 2 });
  fireEvent.click(summary());
  const menu = screen.getByRole("menu", { name: "Just 2 minutes" });
  for (const radio of within(menu).getAllByRole("menuitemradio")) {
    expect(radio).toHaveAttribute("aria-checked", "false");
  }
});

test("popover_settings_link_opens_timer", async () => {
  mockBackend();
  const onNavigate = vi.fn();
  render(<Today onNavigate={onNavigate} />);
  await settle();
  fireEvent.click(summary());
  fireEvent.click(screen.getByRole("menuitem", { name: /Edit times in Settings/ }));
  expect(onNavigate).toHaveBeenCalledWith("settings", "timer");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
