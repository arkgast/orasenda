import { resetPresetsForTests } from "@domain/presets/presets";
import type { Settings } from "@shared/ipc/bindings";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import type { Replies } from "@shared/test/fixtures";
import {
  DEEP,
  deferred,
  emitPresetsChanged,
  emitSettingsChanged,
  emitTimer,
  IDLE,
  PAUSED,
  PRESETS,
  RUNNING,
  SETTINGS,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import {
  INVALID,
  openPane,
  openSettings,
  pick,
  REST,
  saveLine,
  sets,
  statusNodes,
  view,
  WRITE,
  WRITE_REASON,
} from "./Settings.support";

const openIn = (replies: Replies = {}) => openSettings(replies, "Timer");

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
  resetPresetsForTests();
  clearMocks();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
});

// ---- Timer ----

const presetRadio = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });

test("settings_timer_radios_from_library", async () => {
  const { backend } = await openIn();
  const radios = within(screen.getByRole("group", { name: "Preset library" })).getAllByRole(
    "radio",
  );
  expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
    "Gentle Start15 / 5 · long 15 after 4",
    "Steady Focus25 / 5 · long 15 after 4",
    "Deep Work90 / 15 · long 30 after 2",
  ]);
  expect(presetRadio("Steady Focus")).toBeChecked();
  // The Custom fields are gone.
  expect(screen.queryByLabelText("Focus minutes")).toBeNull();
  expect(screen.queryByLabelText("Break minutes")).toBeNull();
  expect(screen.queryByRole("radio", { name: /Custom/ })).toBeNull();

  fireEvent.click(presetRadio("Deep Work"));
  await settle();
  expect(sets(backend)).toEqual([{ settings: { ...SETTINGS, presetId: DEEP } }]);
  expect(presetRadio("Deep Work")).toBeChecked();
  expect(saveLine()).toHaveTextContent(REST);
});

test("an_unknown_saved_preset_checks_the_first_one", async () => {
  await openIn({ settings_get: () => ({ ...SETTINGS, presetId: "removed" }) });
  expect(presetRadio("Gentle Start")).toBeChecked();
});

test("radios_follow_presets_changed", async () => {
  await openIn();
  await emitPresetsChanged(PRESETS.slice(1));
  expect(screen.queryByRole("radio", { name: /^Gentle Start/ })).toBeNull();
  expect(presetRadio("Steady Focus")).toBeChecked();
});

test("a_refused_preset_rolls_back_with_its_own_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openIn({ settings_set: () => Promise.reject(INVALID) });
  fireEvent.click(presetRadio("Deep Work"));
  await settle();
  expect(presetRadio("Steady Focus")).toBeChecked();
  expect(saveLine()).toHaveTextContent("Preset wasn't saved. Back to Steady Focus.");
  expect(screen.getByText(WRITE_REASON)).toBeInTheDocument();
});

test("running_session_line_only_while_not_idle", async () => {
  await openIn();
  const line = "A session is running. Changes apply to your next session.";
  expect(screen.queryByText(line)).toBeNull();
  await emitTimer(RUNNING);
  expect(screen.getByText(line)).toBeInTheDocument();
  await emitTimer(PAUSED);
  expect(screen.getByText(line)).toBeInTheDocument();
  await emitTimer(IDLE);
  expect(screen.queryByText(line)).toBeNull();
});

// ---- Save line ----

test("choosing_a_preset_leaves_the_save_line_at_rest", async () => {
  await openSettings();
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
  await openPane("Timer");
  fireEvent.click(presetRadio("Gentle Start"));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
  await openPane("General");
  fireEvent.click(screen.getByRole("radio", { name: "Light" }));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
});

test("exactly_one_status_node_at_every_step", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fail = { on: false };
  await openSettings({ settings_set: () => (fail.on ? Promise.reject(WRITE) : null) });
  expect(statusNodes(), "rest").toHaveLength(1);
  await openPane("Timer");
  fireEvent.click(presetRadio("Deep Work"));
  await settle();
  expect(statusNodes(), "saved").toHaveLength(1);
  await openPane("General");
  fail.on = true;
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(statusNodes(), "write failure").toHaveLength(1);
  await emitTimer({ ...IDLE, store: "unavailable" });
  expect(statusNodes(), "unavailable").toHaveLength(1);
  await emitTimer({ ...IDLE, store: "newer" });
  expect(statusNodes(), "newer").toHaveLength(1);
});

test("write_failure_rolls_back_and_try_again_resends", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const { backend } = await openSettings({
    settings_set: () => (fail ? Promise.reject(WRITE) : null),
  });
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(screen.getByRole("radio", { name: "Match system" })).toBeChecked();
  expect(screen.getByText(WRITE_REASON)).toBeInTheDocument();
  expect(saveLine()).toHaveTextContent("Theme wasn't saved. Back to Match system.");
  expect(document.documentElement.dataset.theme).toBeUndefined();

  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again saving theme" }));
  await settle();
  expect(sets(backend)).toHaveLength(2);
  expect(sets(backend)[1]?.settings.theme).toBe("dark");
});

test("multi_change_failure_shows_general_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const reload = deferred<Settings>();
  let gets = 0;
  const { backend } = await openSettings({
    settings_get: () => (++gets === 1 ? SETTINGS : reload.promise),
    settings_set: () => Promise.reject(WRITE),
  });
  // A reload is in flight, so both changes go out in one save.
  await emitSettingsChanged(SETTINGS);
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  pick("Timer");
  fireEvent.click(presetRadio("Gentle Start"));
  reload.resolve(SETTINGS);
  await settle();
  expect(sets(backend)).toHaveLength(1);
  expect(saveLine()).toHaveTextContent(
    "Your last changes weren't saved. Settings are back to what was saved.",
  );
  expect(screen.getAllByText(WRITE_REASON).length).toBe(1);
  pick("General");
  expect(screen.getAllByText(WRITE_REASON).length).toBe(1);
  expect(screen.getByRole("button", { name: "Try again saving your changes" })).toBeInTheDocument();
});

test("store_unavailable_shows_standing_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openIn({ timer_state: view({ store: "unavailable" }) });
  const standing = "Orasenda can't save settings right now. Changes you make here may not be kept.";
  expect(saveLine()).toHaveTextContent(standing);
  expect(screen.queryByRole("button", { name: "Try again saving" })).toBeNull();
});

test("store_unavailable_failure_offers_try_again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const UNAVAILABLE = { kind: "unavailable", message: "no store" };
  let fail = true;
  const { backend } = await openSettings({
    timer_state: view({ store: "unavailable" }),
    settings_set: () => (fail ? Promise.reject(UNAVAILABLE) : null),
  });
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(saveLine()).toHaveTextContent(
    "Orasenda can't save settings right now. Changes you make here may not be kept.",
  );
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again saving" }));
  await settle();
  expect(sets(backend)).toHaveLength(2);
  expect(sets(backend)[1]?.settings.theme).toBe("dark");
});

test("store_newer_disables_every_control", async () => {
  const { container } = await openIn({ timer_state: view({ store: "newer" }) });
  for (const control of container.querySelectorAll("input")) expect(control).toBeDisabled();
  expect(screen.getAllByText("Read-only until you update Orasenda.").length).toBeGreaterThanOrEqual(
    3,
  );
  expect(saveLine()).toHaveTextContent(
    "This data was saved by a newer Orasenda. Settings are read-only until you update.",
  );
});

test("settings_timer_presets_list_failure_shows_the_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openIn({
    presets_list: () => {
      throw new Error("no library");
    },
  });
  expect(screen.getByText("Can't read your presets right now.")).toBeInTheDocument();
});
