import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Settings } from "../../ipc/bindings";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { argsOf, mockBackend, SETTINGS, settle } from "../../test/fixtures";
import { Today } from "./Today";
import { INVALID_SPEC, RANGE_HELP, renderToday, savedSettings } from "./Today.support";

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

// Chained saves (#101): one settings_set in flight, the latest intent sent after it answers

const WRITE_FAILED = { kind: "write", message: "disk full" };

/** A settings_set reply held until the test answers it, with either outcome. */
type Held = { resolve: () => void; reject: (error: unknown) => void };

/** settings_set replies held in call order; `held[i]` answers the i-th save. */
function heldSaves(): { held: Held[]; reply: () => Promise<null> } {
  const held: Held[] = [];
  return {
    held,
    reply: () =>
      new Promise<null>((done, fail) => {
        held.push({ resolve: () => done(null), reject: fail });
      }),
  };
}

function settingsSent(backend: { calls: { cmd: string; args: unknown }[] }): Settings[] {
  return argsOf(backend.calls, "settings_set").map(
    (args) => (args as { settings: Settings }).settings,
  );
}

async function answer(reply: () => void) {
  await act(async () => reply());
  await settle();
}

test("one_save_in_flight_and_the_latest_intent_follows_it", async () => {
  const { held, reply } = heldSaves();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: reply,
  });
  const focus = screen.getByLabelText("Focus minutes");

  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("radio", { name: "Classic 25/5" }));
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();

  // Only the first save is in flight; the screen already shows the latest intent.
  expect(settingsSent(backend)).toEqual([
    {
      theme: "system",
      preset: "custom",
      custom: { focusMin: 60, breakMin: 10 },
      notifySessionEnd: true,
    },
  ]);
  expect(screen.getByRole("radio", { name: "50/10" })).toBeChecked();

  await answer(() => held[0].resolve());
  // Only the latest intent follows, not each step on the way to it.
  expect(settingsSent(backend)).toHaveLength(2);
  expect(settingsSent(backend)[1]).toEqual({
    theme: "system",
    preset: "fifty_ten",
    custom: { focusMin: 60, breakMin: 10 },
    notifySessionEnd: true,
  });

  await answer(() => held[1].resolve());
  expect(settingsSent(backend)).toHaveLength(2);
  expect(screen.getByRole("radio", { name: "50/10" })).toBeChecked();
});

test("failed_save_rolls_back_over_changes_queued_behind_it", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { held, reply } = heldSaves();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: reply,
  });
  const focus = screen.getByLabelText("Focus minutes");

  // The issue's case: Focus 60 fails to write; 50/10 is chosen before the failure answers.
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();
  await answer(() => held[0].reject(WRITE_FAILED));

  // Rust holds Custom 45, and so does the screen; nothing more is sent.
  expect(settingsSent(backend)).toHaveLength(1);
  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(45);
  expect(error).toHaveBeenCalledWith("settings_set failed", WRITE_FAILED);
});

test("failed_preset_save_then_out_of_range_custom_ends_on_what_rust_holds", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { held, reply } = heldSaves();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "fifty_ten" }),
    settings_set: reply,
  });

  // Save 1 (Custom, 45) will fail to write; 200 is typed and committed while it is in flight.
  fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
  await settle();
  const focus = screen.getByLabelText("Focus minutes");
  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  await settle();
  await answer(() => held[0].reject(WRITE_FAILED));
  // Were 200 sent, Rust would refuse it as out of range; either way Rust holds 50/10.
  for (const save of held.slice(1)) await answer(() => save.reject(INVALID_SPEC));

  expect(screen.getByRole("radio", { name: "50/10" })).toBeChecked();
  expect(screen.queryByLabelText("Focus minutes")).toBeNull();
  expect(settingsSent(backend)).toHaveLength(1);
});

test("failed_save_rolls_back_to_the_save_accepted_just_before_it", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { held, reply } = heldSaves();
  await renderToday({ ...savedSettings({ preset: "custom" }), settings_set: reply });
  const focus = screen.getByLabelText("Focus minutes");

  // Save 1 (Custom, 60) succeeds; save 2 (50/10, 60) follows it and fails.
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();
  await answer(() => held[0].resolve());
  await answer(() => held[1].reject(WRITE_FAILED));

  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(60);
  expect(screen.getByLabelText("Break minutes")).toHaveValue(10);
});

test("out_of_range_spec_replaced_while_in_flight_is_not_kept", async () => {
  const { held, reply } = heldSaves();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: reply,
  });
  const focus = screen.getByLabelText("Focus minutes");

  // Save 1 (200) is out of range; 60 is committed before Rust answers it.
  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  await settle();
  await answer(() => held[0].reject(INVALID_SPEC));
  expect(settingsSent(backend)).toHaveLength(2);
  await answer(() => held[1].resolve());

  expect(focus).toHaveValue(60);
  expect(screen.queryByText(RANGE_HELP)).toBeNull();

  fireEvent.click(screen.getByRole("radio", { name: "Classic 25/5" }));
  await settle();
  expect(settingsSent(backend)[2]).toEqual({
    theme: "system",
    preset: "classic",
    custom: { focusMin: 60, breakMin: 10 },
    notifySessionEnd: true,
  });
  await answer(() => held[2].resolve());
});

test("out_of_range_spec_after_an_accepted_save_keeps_that_save", async () => {
  const { held, reply } = heldSaves();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: reply,
  });
  const focus = screen.getByLabelText("Focus minutes");

  // Save 1 (60) succeeds; save 2 (200) follows it and is out of range.
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  await settle();
  await answer(() => held[0].resolve());
  await answer(() => held[1].reject(INVALID_SPEC));

  // The typed draft stays beside the helper.
  expect(focus).toHaveValue(200);
  expect(screen.getByText(RANGE_HELP)).toBeInTheDocument();

  // The next change sends the spec Rust holds (60), never the rejected one or the older 45.
  fireEvent.click(screen.getByRole("radio", { name: "Classic 25/5" }));
  await settle();
  expect(settingsSent(backend)[2]).toEqual({
    theme: "system",
    preset: "classic",
    custom: { focusMin: 60, breakMin: 10 },
    notifySessionEnd: true,
  });
  await answer(() => held[2].resolve());
});

test("unmount_with_a_chained_save_still_sends_the_latest_intent", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { held, reply } = heldSaves();
  const { backend, unmount } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: reply,
  });
  const focus = screen.getByLabelText("Focus minutes");

  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();
  unmount();
  await answer(() => held[0].resolve());

  expect(settingsSent(backend)).toHaveLength(2);
  expect(settingsSent(backend)[1]).toEqual({
    theme: "system",
    preset: "fifty_ten",
    custom: { focusMin: 60, breakMin: 10 },
    notifySessionEnd: true,
  });
  await answer(() => held[1].resolve());
  expect(settingsSent(backend)).toHaveLength(2);
  expect(error).not.toHaveBeenCalled();
});

/** A backend whose settings_get returns what the last answered settings_set wrote. */
function statefulBackend() {
  let stored: Settings = { ...SETTINGS, preset: "custom" };
  const held: Held[] = [];
  const backend = mockBackend({
    settings_get: () => stored,
    settings_set: (args) =>
      new Promise<null>((done, fail) => {
        held.push({
          resolve: () => {
            stored = (args as { settings: Settings }).settings;
            done(null);
          },
          reject: fail,
        });
      }),
  });
  return { backend, held };
}

function settingsCommands(backend: { calls: { cmd: string }[] }): string[] {
  return backend.calls.map((call) => call.cmd).filter((cmd) => cmd.startsWith("settings_"));
}

async function editFocus60() {
  const focus = screen.getByLabelText("Focus minutes");
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  await settle();
}

test("remounted_today_waits_for_the_in_flight_save", async () => {
  const { backend, held } = statefulBackend();
  const first = render(<Today />);
  await settle();
  await editFocus60();
  first.unmount();
  render(<Today />);
  await settle();

  expect(settingsCommands(backend)).toEqual(["settings_get", "settings_set"]);
  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(60);

  await answer(() => held[0].resolve());
  expect(settingsCommands(backend)).toEqual(["settings_get", "settings_set", "settings_get"]);
  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(60);
});

test("remounted_today_keeps_text_typed_while_the_save_is_in_flight", async () => {
  const { held } = statefulBackend();
  const first = render(<Today />);
  await settle();
  await editFocus60();
  first.unmount();
  render(<Today />);
  await settle();
  fireEvent.change(screen.getByLabelText("Focus minutes"), { target: { value: "70" } });

  await answer(() => held[0].resolve());
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(70);
});

test("remounted_today_sends_the_intent_queued_before_unmount_after_the_save_answers", async () => {
  const { backend, held } = statefulBackend();
  const first = render(<Today />);
  await settle();
  await editFocus60();
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  first.unmount();
  render(<Today />);
  await settle();
  expect(settingsCommands(backend)).toEqual(["settings_get", "settings_set"]);

  await answer(() => held[0].resolve());
  expect(settingsCommands(backend)).toEqual(["settings_get", "settings_set", "settings_set"]);
  expect(settingsSent(backend)[1].preset).toBe("fifty_ten");

  await answer(() => held[1].resolve());
  expect(settingsCommands(backend).slice(3)).toEqual(["settings_get"]);
  expect(screen.getByRole("radio", { name: "50/10" })).toBeChecked();
});

test("failed_save_after_unmount_rolls_back_and_sends_nothing_more", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { backend, held } = statefulBackend();
  const first = render(<Today />);
  await settle();
  await editFocus60();
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  first.unmount();
  await answer(() => held[0].reject(WRITE_FAILED));

  expect(settingsSent(backend)).toHaveLength(1);
  expect(error).toHaveBeenCalledWith("settings_set failed", WRITE_FAILED);
  render(<Today />);
  await settle();
  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(45);
});

test("out_of_range_spec_refused_after_unmount_is_not_resent", async () => {
  const { backend, held } = statefulBackend();
  const first = render(<Today />);
  await settle();
  const focus = screen.getByLabelText("Focus minutes");
  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  await settle();
  first.unmount();
  await answer(() => held[0].reject({ kind: "invalidSpec", message: "focus_min out of range" }));

  expect(settingsSent(backend)).toHaveLength(1);
  render(<Today />);
  await settle();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(45);
  expect(screen.queryByText(RANGE_HELP)).toBeNull();
});
