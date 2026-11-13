import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import {
  argsOf,
  DEEP,
  emitClock,
  emitPresetsChanged,
  emitTimer,
  GENTLE,
  mockBackend,
  PAUSED,
  PRESETS,
  RUNNING,
  SETTINGS,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PresetSummary } from "./PresetSummary";
import { resetPresetsForTests } from "./presets";
import { Today } from "./Today";
import { renderToday, savedSettings } from "./Today.support";

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
  expect(button).toHaveAccessibleName("Preset Steady Focus, 25 minutes, ends 15:20. Change preset");
  expect(button).toHaveAttribute("aria-haspopup", "menu");
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(button.querySelector('[data-slot="preset-summary-full"]')).toHaveTextContent(
    "Steady Focus · 25 min · ends 15:20",
  );
});

test("summary_running_ends_from_view_finish", async () => {
  await renderToday();
  await emitTimer(RUNNING);
  expect(summary()).toHaveAccessibleName("Preset Steady Focus, ends 15:20. Preset details");
});

test("summary_paused_uses_planned_min", async () => {
  await renderToday();
  await emitTimer({ ...PAUSED, plannedMin: 50 });
  expect(summary()).toHaveAccessibleName("Preset Steady Focus, 50 minutes, paused. Preset details");
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

test("popover_lists_library_presets", async () => {
  await renderToday();
  fireEvent.click(summary());
  const menu = screen.getByRole("menu", { name: "Preset for the next session" });
  expect(summary()).toHaveAttribute("aria-expanded", "true");
  expect(summary()).toHaveAttribute("aria-controls", menu.id);
  expect(menu).toHaveAccessibleDescription("Choosing one applies it and closes.");
  const radios = within(menu).getAllByRole("menuitemradio");
  expect(radios.map((radio) => radio.textContent)).toEqual([
    "Gentle Start15 / 5",
    "Steady Focus25 / 5",
    "Deep Work90 / 15",
  ]);
  expect(radios[1]).toHaveAttribute("aria-checked", "true");
  expect(
    within(menu).getByRole("menuitem", { name: /Edit presets in Settings/ }),
  ).toHaveTextContent("⌘,");
});

test("popover_follows_presets_changed", async () => {
  await renderToday();
  await emitPresetsChanged([
    ...PRESETS,
    {
      id: "user-1",
      name: "50/10",
      focusMin: 50,
      breakMin: 10,
      longBreakMin: 20,
      rounds: 4,
      isDefault: false,
      isChanged: false,
    },
  ]);
  fireEvent.click(summary());
  const radios = within(screen.getByRole("menu")).getAllByRole("menuitemradio");
  expect(radios.map((radio) => radio.textContent)).toContain("50/1050 / 10");
});

test("popover_choose_saves_and_closes", async () => {
  const { backend } = await renderToday();
  fireEvent.click(summary());
  fireEvent.click(screen.getByRole("menuitemradio", { name: /Deep Work/ }));
  await settle();
  expect(argsOf(backend.calls, "settings_set")).toEqual([
    { settings: { ...SETTINGS, presetId: DEEP } },
  ]);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(summary()).toHaveAccessibleName(/^Preset Deep Work, 90 minutes/);
});

test("an_unknown_saved_preset_shows_the_first_one", async () => {
  await renderToday(savedSettings({ presetId: "removed" }));
  expect(summary()).toHaveAccessibleName(/^Preset Gentle Start, 15 minutes/);
});

test("popover_running_read_only_heading_from_the_snapshot", async () => {
  await renderToday();
  await emitTimer(RUNNING);
  fireEvent.click(summary());
  const menu = screen.getByRole("menu", { name: "Steady Focus · 25 / 5" });
  expect(menu).toHaveAccessibleDescription("Presets can change between sessions.");
  for (const radio of within(menu).getAllByRole("menuitemradio")) {
    expect(radio).toHaveAttribute("aria-disabled", "true");
  }
  expect(within(menu).getByRole("menuitemradio", { name: /Steady Focus/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(
    within(menu).getByRole("menuitem", { name: /Edit presets in Settings/ }),
  ).not.toHaveAttribute("aria-disabled");
});

test("a_session_keeps_its_snapshot_name_when_the_library_changes", async () => {
  await renderToday();
  await emitTimer({ ...RUNNING, presetId: GENTLE, presetName: "Old name", breakMin: 3 });
  await emitPresetsChanged(PRESETS.slice(1));
  expect(summary()).toHaveAccessibleName("Preset Old name, ends 15:20. Preset details");
  fireEvent.click(summary());
  expect(screen.getByRole("menu", { name: "Old name · 25 / 3" })).toBeInTheDocument();
});

test("popover_quick_no_checked_radio", async () => {
  await renderToday();
  await emitTimer({
    ...RUNNING,
    presetId: null,
    presetName: "Just 2 minutes",
    quick: true,
    breakMin: null,
    plannedMin: 2,
  });
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
  fireEvent.click(screen.getByRole("menuitem", { name: /Edit presets in Settings/ }));
  expect(onNavigate).toHaveBeenCalledWith("settings", "timer");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("popover_failed_save_rolls_summary_back", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday({
    settings_set: () => {
      throw new Error("disk full");
    },
  });
  fireEvent.click(summary());
  fireEvent.click(screen.getByRole("menuitemradio", { name: /Deep Work/ }));
  await settle();
  expect(summary()).toHaveAccessibleName(/^Preset Steady Focus, 25 minutes/);
});

test("summary_presets_list_failure_shows_unavailable", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday({
    presets_list: () => {
      throw new Error("no library");
    },
  });
  expect(screen.getByRole("button", { name: "Presets unavailable" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("summary_focus_form_has_no_settings_row", async () => {
  mockBackend();
  const chosen: string[] = [];
  render(
    <PresetSummary
      state="idle"
      settings={SETTINGS}
      settingsFailed={false}
      session={null}
      idleFinish="15:20"
      strip={false}
      onChoose={(id) => chosen.push(id)}
    />,
  );
  await settle();
  fireEvent.click(summary());
  const menu = screen.getByRole("menu", { name: "Preset for the next session" });
  expect(menu).toHaveAccessibleDescription("Choosing one applies it and closes.");
  expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(3);
  expect(within(menu).queryByRole("menuitem")).toBeNull();
  expect(within(menu).queryByText(/Settings/)).toBeNull();
  fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Gentle Start/ }));
  expect(chosen).toEqual([GENTLE]);
});
