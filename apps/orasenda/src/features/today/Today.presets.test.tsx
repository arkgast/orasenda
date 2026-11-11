import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Settings } from "../../ipc/bindings";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { argsOf, deferred, SETTINGS, settle } from "../../test/fixtures";
import { INVALID_SPEC, RANGE_HELP, renderToday, savedSettings, statusNodes } from "./Today.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});

afterEach(async () => {
  // Unmount (and unlisten) while the IPC mock is still installed.
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

// Presets

test("preset_radio_reflects_saved_settings", async () => {
  const { container } = await renderToday(savedSettings({ preset: "deep_block" }));

  const group = screen.getByRole("group", { name: "Preset" });
  expect(group.tagName).toBe("FIELDSET");
  expect(group).toHaveAttribute("data-slot", "choice-group");
  const radios = screen.getAllByRole("radio");
  expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
    "Classic 25/5",
    "50/10",
    "Deep Block 90",
    "Custom",
  ]);
  for (const radio of radios) expect(radio.closest("label")).toHaveAttribute("data-slot", "choice");
  expect(screen.getByRole("radio", { name: "Deep Block 90" })).toBeChecked();
  expect(container.querySelectorAll("input:not([type=radio])")).toHaveLength(0);
});

test("custom_shows_two_inputs_and_invalid_spec_shows_helper", async () => {
  const { backend } = await renderToday({
    settings_set: (args) =>
      (args as { settings: Settings }).settings.custom.focusMin > 180
        ? Promise.reject(INVALID_SPEC)
        : null,
  });
  expect(screen.queryByLabelText("Focus minutes")).toBeNull();

  fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
  await settle();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(45);
  expect(screen.getByLabelText("Break minutes")).toHaveValue(10);
  expect(screen.queryByText(RANGE_HELP)).toBeNull();

  const focus = screen.getByLabelText("Focus minutes");
  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  await settle();

  expect(argsOf(backend.calls, "settings_set")).toHaveLength(2);
  expect(screen.getByText(RANGE_HELP)).toBeInTheDocument();
  expect(focus).not.toHaveAttribute("aria-invalid");
  expect(statusNodes()).toHaveLength(0);
});

test("custom_inputs_commit_on_blur_not_per_keystroke", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "custom" }));
  const focus = screen.getByLabelText("Focus minutes");
  const breakInput = screen.getByLabelText("Break minutes");

  fireEvent.change(focus, { target: { value: "6" } });
  fireEvent.change(focus, { target: { value: "60" } });
  await settle();
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(0);

  fireEvent.blur(focus);
  await settle();
  fireEvent.change(breakInput, { target: { value: "15" } });
  fireEvent.keyDown(breakInput, { key: "Enter" });
  await settle();

  expect(argsOf(backend.calls, "settings_set")).toEqual([
    {
      settings: {
        theme: "system",
        preset: "custom",
        custom: { focusMin: 60, breakMin: 10 },
        notifySessionEnd: true,
      },
    },
    {
      settings: {
        theme: "system",
        preset: "custom",
        custom: { focusMin: 60, breakMin: 15 },
        notifySessionEnd: true,
      },
    },
  ]);
});

test("preset_change_calls_settings_set", async () => {
  const { backend } = await renderToday();

  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();

  expect(screen.getByRole("radio", { name: "50/10" })).toBeChecked();
  expect(argsOf(backend.calls, "settings_set")).toEqual([
    { settings: { ...SETTINGS, preset: "fifty_ten" } },
  ]);
});

// Review round 1

test("preset_change_after_custom_commit_keeps_the_edit", async () => {
  // The blur's settings_set is still in flight when the preset changes.
  const saving = deferred<null>();
  let call = 0;
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: () => (call++ === 0 ? saving.promise : null),
  });
  const focus = screen.getByLabelText("Focus minutes");

  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("radio", { name: "Classic 25/5" }));
  await settle();
  // The preset change waits for the blur's save to answer.
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(1);
  await act(async () => saving.resolve(null));
  await settle();

  expect(argsOf(backend.calls, "settings_set")).toEqual([
    {
      settings: {
        theme: "system",
        preset: "custom",
        custom: { focusMin: 60, breakMin: 10 },
        notifySessionEnd: true,
      },
    },
    {
      settings: {
        theme: "system",
        preset: "classic",
        custom: { focusMin: 60, breakMin: 10 },
        notifySessionEnd: true,
      },
    },
  ]);
});

test("committing_the_saved_spec_again_clears_the_helper", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: (args) =>
      (args as { settings: Settings }).settings.custom.focusMin > 180
        ? Promise.reject(INVALID_SPEC)
        : null,
  });
  const focus = screen.getByLabelText("Focus minutes");

  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  await settle();
  expect(screen.getByText(RANGE_HELP)).toBeInTheDocument();

  fireEvent.change(focus, { target: { value: "45" } });
  fireEvent.blur(focus);
  await settle();

  expect(screen.queryByText(RANGE_HELP)).toBeNull();
  // 45 is what Rust already has: nothing more to save.
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(1);
});

test("rejected_settings_get_shows_presets_unavailable", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday({
    settings_get: () => {
      throw new Error("settings_get not allowed");
    },
  });

  const line = screen.getByText("Presets unavailable.");
  expect(line.tagName).toBe("P");
  expect(line).toHaveClass("app-muted");
  expect(line).not.toHaveAttribute("role");
  expect(screen.queryByRole("group", { name: "Preset" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  // Start still works with the default preset.
  expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
  expect(error).toHaveBeenCalledTimes(1);
});

test("failed_settings_set_rolls_back_to_the_accepted_settings", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    // Only the first save (Custom, 60 minutes) is written; every later one fails.
    settings_set: (args) => {
      const { preset, custom } = (args as { settings: Settings }).settings;
      return preset === "custom" && custom.focusMin === 60
        ? null
        : Promise.reject({ kind: "write", message: "disk full" });
    },
  });
  const focus = screen.getByLabelText("Focus minutes");
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  await settle();

  // Accepted: custom 60. Now a write fails for a preset change and a custom edit.
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();
  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(60);

  fireEvent.change(screen.getByLabelText("Focus minutes"), { target: { value: "70" } });
  fireEvent.blur(screen.getByLabelText("Focus minutes"));
  await settle();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(60);
  expect(screen.queryByText(RANGE_HELP)).toBeNull();

  expect(argsOf(backend.calls, "settings_set")).toHaveLength(3);
  expect(error).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith("settings_set failed", {
    kind: "write",
    message: "disk full",
  });
});
