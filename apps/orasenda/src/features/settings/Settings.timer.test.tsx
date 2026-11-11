import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Settings } from "../../ipc/bindings";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import {
  deferred,
  emitSettingsChanged,
  emitTimer,
  IDLE,
  PAUSED,
  RUNNING,
  SETTINGS,
  settle,
} from "../../test/fixtures";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import {
  blur,
  breakInput,
  focusInput,
  INVALID,
  openSettings,
  REST,
  saveLine,
  sets,
  statusNodes,
  type,
  view,
  WRITE,
  WRITE_REASON,
} from "./Settings.support";

beforeEach(() => {
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
  delete document.documentElement.dataset.theme;
});

// ---- Timer ----

test("minute_field_saves_on_blur_and_return", async () => {
  const { backend } = await openSettings();
  await type(focusInput(), "50");
  expect(sets(backend)).toHaveLength(0);
  await blur(focusInput());
  expect(sets(backend)).toEqual([
    { settings: { ...SETTINGS, custom: { focusMin: 50, breakMin: 10 } } },
  ]);
  expect(sets(backend)[0]?.settings.preset).toBe("classic");
  expect(saveLine()).toHaveTextContent("Saved. Custom focus is now 50 minutes.");

  await type(breakInput(), "15");
  fireEvent.keyDown(breakInput(), { key: "Enter" });
  await settle();
  expect(sets(backend)).toHaveLength(2);
  expect(saveLine()).toHaveTextContent("Saved. Custom break is now 15 minutes.");
});

test("esc_restores_saved_value_and_clears_error", async () => {
  await openSettings();
  await type(focusInput(), "abc");
  await type(focusInput(), "");
  await blur(focusInput());
  expect(focusInput()).toHaveAttribute("aria-invalid", "true");
  fireEvent.keyDown(focusInput(), { key: "Escape" });
  await settle();
  expect(focusInput()).toHaveValue(45);
  expect(focusInput()).not.toHaveAttribute("aria-invalid", "true");
  expect(saveLine()).toHaveTextContent(REST);
});

test("non_number_refused_locally_without_ipc", async () => {
  const { backend } = await openSettings();
  await type(focusInput(), "");
  await blur(focusInput());
  expect(sets(backend)).toHaveLength(0);
  expect(screen.getByText("Between 5 and 180 minutes. Still using 45.")).toBeInTheDocument();
  expect(saveLine()).toHaveTextContent("Focus minutes weren't saved. Still using 45.");
});

test("invalid_spec_shows_field_error_and_save_line_with_show", async () => {
  const { backend } = await openSettings({ settings_set: () => Promise.reject(INVALID) });
  await type(focusInput(), "3");
  await blur(focusInput());
  expect(sets(backend)).toHaveLength(1);
  expect(focusInput()).toHaveValue(3);
  expect(focusInput()).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("Between 5 and 180 minutes. Still using 45.")).toBeInTheDocument();
  expect(
    statusNodes().some((n) => n.textContent === "Focus minutes weren't saved. Still using 45."),
  ).toBe(true);
  breakInput().focus();
  fireEvent.click(screen.getByRole("button", { name: "Show focus minutes" }));
  expect(focusInput()).toHaveFocus();
});

test("both_fields_invalid_show_both_errors", async () => {
  await openSettings({ settings_set: () => Promise.reject(INVALID) });
  await type(focusInput(), "3");
  await type(breakInput(), "70");
  await blur(breakInput());
  expect(screen.getByText("Between 5 and 180 minutes. Still using 45.")).toBeInTheDocument();
  expect(screen.getByText("Between 1 and 60 minutes. Still using 10.")).toBeInTheDocument();
  expect(
    statusNodes().some(
      (n) => n.textContent === "Focus and break minutes weren't saved. Still using 45 and 10.",
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Show focus minutes" }));
  expect(focusInput()).toHaveFocus();
});

test("fields_show_under_every_preset", async () => {
  for (const preset of ["classic", "fifty_ten", "deep_block", "custom"] as const) {
    await openSettings({ settings_get: () => ({ ...SETTINGS, preset }) });
    expect(focusInput()).toBeInTheDocument();
    expect(breakInput()).toBeInTheDocument();
    expect(screen.getByText("Between 5 and 180 minutes.")).toBeInTheDocument();
    expect(screen.getByText("Between 1 and 60 minutes.")).toBeInTheDocument();
    cleanup();
    await settle();
    clearMocks();
    resetSettingsQueueForTests();
  }
});

test("running_session_line_only_while_not_idle", async () => {
  await openSettings();
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

test("saved_line_only_for_minute_fields", async () => {
  await openSettings();
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
  await type(focusInput(), "60");
  await blur(focusInput());
  expect(saveLine()).toHaveTextContent("Saved. Custom focus is now 60 minutes.");
  fireEvent.click(screen.getByRole("radio", { name: "Light" }));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
});

test("exactly_one_status_node_at_every_step", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fail = { on: false };
  await openSettings({ settings_set: () => (fail.on ? Promise.reject(WRITE) : null) });
  expect(statusNodes(), "rest").toHaveLength(1);
  await type(focusInput(), "50");
  await blur(focusInput());
  expect(statusNodes(), "saved").toHaveLength(1);
  await type(focusInput(), "");
  await blur(focusInput());
  expect(statusNodes(), "invalid value").toHaveLength(1);
  expect(focusInput()).toHaveAttribute("aria-invalid", "true");
  const described = focusInput().getAttribute("aria-describedby") ?? "";
  const errorNode = described
    .split(" ")
    .map((id) => document.getElementById(id))
    .find((n) => n?.textContent?.includes("Between 5 and 180 minutes. Still using 50."));
  expect(errorNode, "aria-describedby names the error paragraph").toBeTruthy();
  expect(errorNode?.tagName, "error element is a paragraph").toBe("P");
  expect(errorNode).toHaveTextContent("Between 5 and 180 minutes. Still using 50.");
  fireEvent.keyDown(focusInput(), { key: "Escape" });
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
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  reload.resolve(SETTINGS);
  await settle();
  expect(sets(backend)).toHaveLength(1);
  expect(saveLine()).toHaveTextContent(
    "Your last changes weren't saved. Settings are back to what was saved.",
  );
  expect(screen.getAllByText(WRITE_REASON).length).toBe(2);
  expect(screen.getByRole("button", { name: "Try again saving your changes" })).toBeInTheDocument();
});

test("store_unavailable_shows_standing_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ timer_state: view({ store: "unavailable" }) });
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
  const { container } = await openSettings({ timer_state: view({ store: "newer" }) });
  for (const control of container.querySelectorAll("input")) expect(control).toBeDisabled();
  expect(screen.getAllByText("Read-only until you update Orasenda.").length).toBeGreaterThanOrEqual(
    4,
  );
  expect(saveLine()).toHaveTextContent(
    "This data was saved by a newer Orasenda. Settings are read-only until you update.",
  );
});
