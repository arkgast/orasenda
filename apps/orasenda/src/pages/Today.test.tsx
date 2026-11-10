import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Settings } from "../bindings";
import { resetSettingsQueueForTests } from "../settingsQueue";
import { resetTimerQueueForTests } from "../timerQueue";
import { Today } from "./Today";
import {
  argsOf,
  deferred,
  emitClock,
  emitMilestone,
  emitTimer,
  IDLE,
  mockBackend,
  PAUSED,
  type Replies,
  RUNNING,
  SETTINGS,
  settle,
} from "./testing";

const RANGE_HELP = "Between 5 and 180 minutes.";
const INVALID_SPEC = { kind: "invalidSpec", message: "focus_min out of range" };

async function renderToday(replies: Replies = {}) {
  const backend = mockBackend(replies);
  const view = render(<Today />);
  await settle();
  return { backend, ...view };
}

function savedSettings(settings: Partial<Settings>): Replies {
  return { settings_get: () => ({ ...SETTINGS, ...settings }) };
}

/** Elements with exactly `text`, outside the ring (whose centre repeats the chip, hidden). */
function outsideRing(text: string): HTMLElement[] {
  return screen
    .queryAllByText(text)
    .filter((element) => element.closest('[role="timer"]') === null);
}

function statusNodes(): HTMLElement[] {
  return screen.queryAllByRole("status");
}

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

// Starting

test("start_focus_calls_timer_start_with_checked_preset", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "fifty_ten" }));
  expect(screen.getByRole("radio", { name: "50/10" })).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "fifty_ten", custom: null } },
  ]);
});

test("just_two_minutes_calls_timer_start_with_quick", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "custom" }));

  fireEvent.click(screen.getByRole("button", { name: "Just 2 minutes" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "quick", custom: null } },
  ]);
});

test("custom_start_sends_the_current_draft", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "custom" }));

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: { focusMin: 45, breakMin: 10 } } },
  ]);
});

test("start_right_after_custom_edit_uses_the_edit", async () => {
  // The blur's settings_set is still in flight when Start is pressed.
  const saving = deferred<null>();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: () => saving.promise,
  });
  const focus = screen.getByLabelText("Focus minutes");

  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: { focusMin: 60, breakMin: 10 } } },
  ]);
  await act(async () => saving.resolve(null));
});

test("start_with_unparsable_draft_sends_no_custom", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "custom" }));

  fireEvent.change(screen.getByLabelText("Break minutes"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: null } },
  ]);
});

test("start_with_out_of_range_draft_shows_helper", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    timer_start: () => Promise.reject(INVALID_SPEC),
  });
  expect(screen.queryByText(RANGE_HELP)).toBeNull();

  fireEvent.change(screen.getByLabelText("Focus minutes"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: { focusMin: 2, breakMin: 10 } } },
  ]);
  expect(screen.getByText(RANGE_HELP)).toBeInTheDocument();
  expect(screen.getByLabelText("Focus minutes")).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  // Nothing started: the Start button is still there.
  expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
});

// Rendering the clock and the view

test("clock_tick_renders_wall_clock_and_idle_finish", async () => {
  const { container } = await renderToday();

  await emitClock({ epochMs: 1, clock: "14:32", idleFinish: "14:57" });

  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
  const ring = screen.getByRole("timer", { name: "No session" });
  expect(ring).toHaveTextContent("Clock · 14:32");
  expect(outsideRing("No session")).toHaveLength(1);
  expect(container).toHaveTextContent("Realistic finish · 14:57");
  expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
});

test("timer_tick_renders_digits_chip_word_and_planned_finish", async () => {
  const { container } = await renderToday();

  await emitClock({ epochMs: 1, clock: "14:55", idleFinish: null });
  await emitTimer(RUNNING);

  expect(
    screen.getByRole("timer", {
      name: "Focus, 24 minutes 59 seconds remaining, Wall clock, 14:55",
    }),
  ).toHaveTextContent("24:59");
  expect(outsideRing("Focus")).toHaveLength(1);
  expect(container).toHaveTextContent("Realistic finish · 15:20");
  expect(screen.getByRole("button", { name: "Pause" })).toHaveClass("os-btn-quiet");
  expect(screen.getByRole("button", { name: "End session" })).toHaveClass("os-btn-ghost");
  expect(screen.queryByRole("button", { name: "Start focus" })).toBeNull();
});

test("paused_view_renders_paused_once_and_no_finish_line", async () => {
  const { container } = await renderToday();

  await emitTimer(PAUSED);

  expect(screen.getByRole("timer", { name: /^Paused, 24 minutes 59 seconds remaining/ }));
  expect(outsideRing("Paused")).toHaveLength(1);
  expect(container).not.toHaveTextContent("Realistic finish");
  expect(screen.getByRole("button", { name: "Resume" })).toHaveClass("os-btn-quiet");
  expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  expect(screen.getByRole("button", { name: "End session" })).toHaveClass("os-btn-ghost");
});

test("running_finish_line_reads_realistic_finish", async () => {
  await renderToday();

  await emitTimer(RUNNING);

  const time = screen.getByText("15:20");
  expect(time).toHaveClass("os-num");
  const line = time.closest("p");
  expect(line).toHaveTextContent(/^Realistic finish · 15:20$/);
  expect(line).toHaveClass("app-muted");
});

test("pause_resume_and_end_call_their_commands", async () => {
  const { backend } = await renderToday();
  await emitTimer(RUNNING);
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await emitTimer(PAUSED);
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  await settle();

  expect(backend.calls.map((call) => call.cmd)).toEqual(
    expect.arrayContaining(["timer_pause", "timer_resume", "timer_stop"]),
  );
});

// Notices

test("ended_event_shows_session_ended_as_single_status_node", async () => {
  await renderToday();
  expect(statusNodes()).toHaveLength(0);

  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });

  expect(statusNodes()).toHaveLength(1);
  expect(statusNodes()[0]).toHaveTextContent("Session ended.");
  expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
});

test("recovered_pending_event_shows_notice_as_single_status_node", async () => {
  await renderToday({
    timer_state: () => ({
      view: IDLE,
      pending: [{ kind: "recovered", endReason: "completed", sessionId: "s0" }],
    }),
  });

  expect(statusNodes()).toHaveLength(1);
  expect(statusNodes()[0]).toHaveTextContent("Your last session ended while Orasenda was closed.");
});

test("store_unavailable_on_mount_renders_standing_line_once_and_ok_removes_it", async () => {
  await renderToday({
    timer_state: () => ({ view: { ...IDLE, store: "unavailable" }, pending: [] }),
  });
  expect(statusNodes()).toHaveLength(1);
  const line = statusNodes()[0];
  expect(line).toHaveTextContent("Orasenda can't save sessions right now.");

  // Later views in the same state keep the same node: it is announced once.
  await emitTimer({ ...RUNNING, store: "unavailable" });
  expect(statusNodes()).toEqual([line]);

  await emitTimer({ ...RUNNING, store: "ok" });
  expect(statusNodes()).toHaveLength(0);

  await emitTimer({ ...RUNNING, store: "newer" });
  expect(statusNodes()).toHaveLength(1);
  expect(statusNodes()[0]).toHaveTextContent("This data was saved by a newer Orasenda.");
});

test("standing_store_line_after_one_shot_notice_is_announced_once", async () => {
  await renderToday({
    timer_state: () => ({ view: { ...IDLE, store: "unavailable" }, pending: [] }),
  });
  const standing = statusNodes()[0];

  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  expect(statusNodes()).toHaveLength(1);
  expect(statusNodes()[0]).toHaveTextContent("Session ended.");

  await emitMilestone({ kind: "started", sessionId: "s2" });
  expect(statusNodes()).toHaveLength(1);
  expect(statusNodes()[0]).toHaveTextContent("Orasenda can't save sessions right now.");
  // A fresh node: the standing line is announced again after the one-shot notice.
  expect(statusNodes()[0]).not.toBe(standing);
});

test("next_transition_dismisses_one_shot_notice", async () => {
  await renderToday();

  for (const kind of ["started", "paused", "resumed"] as const) {
    await emitMilestone({ kind: "ended", endReason: "stopped", sessionId: "s1" });
    expect(statusNodes()).toHaveLength(1);
    await emitMilestone({ kind, sessionId: "s2" });
    expect(statusNodes()).toHaveLength(0);
  }

  // The idle view that follows an end keeps the notice; a view of another session drops it.
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s2" });
  await emitTimer(IDLE);
  expect(statusNodes()).toHaveLength(1);
  await emitTimer({ ...RUNNING, sessionId: "s3" });
  expect(statusNodes()).toHaveLength(0);
  await emitTimer(IDLE);
  expect(statusNodes()).toHaveLength(0);
});

test("no_notification_line_on_today", async () => {
  await renderToday({
    timer_state: () => ({ view: { ...IDLE, notifications: "notDetermined" }, pending: [] }),
  });
  for (const notifications of ["notDetermined", "granted", "denied", "unavailable"] as const) {
    await emitTimer({ ...IDLE, notifications });
    expect(screen.queryByText(/Orasenda can tell you/)).toBeNull();
  }
});

test("rejected_timer_state_shows_timer_unavailable", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday({
    timer_state: () => {
      throw new Error("timer_state not allowed");
    },
  });

  const line = screen.getByText("Timer unavailable.");
  expect(line.tagName).toBe("P");
  expect(line).toHaveClass("app-muted");
  expect(line).not.toHaveAttribute("role");
  expect(screen.queryByRole("timer")).toBeNull();
  expect(screen.queryByRole("button", { name: "Start focus" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  expect(error).toHaveBeenCalled();
});

// Presets

test("preset_radio_reflects_saved_settings", async () => {
  const { container } = await renderToday(savedSettings({ preset: "deep_block" }));

  const group = screen.getByRole("group", { name: "Preset" });
  expect(group.tagName).toBe("FIELDSET");
  expect(group).toHaveClass("os-choice-group");
  const radios = screen.getAllByRole("radio");
  expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
    "Classic 25/5",
    "50/10",
    "Deep Block 90",
    "Custom",
  ]);
  for (const radio of radios) expect(radio.closest("label")).toHaveClass("os-choice");
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

// Per-field range helpers (#118)

const FOCUS_HELP = RANGE_HELP;
const BREAK_HELP = "Between 1 and 60 minutes.";

function rejectOutOfRange(args: unknown) {
  const { focusMin, breakMin } = (args as { settings: Settings }).settings.custom;
  const focusBad = focusMin < 5 || focusMin > 180;
  const breakBad = breakMin < 1 || breakMin > 60;
  return focusBad || breakBad ? Promise.reject(INVALID_SPEC) : null;
}

test("break_out_of_range_shows_break_helper_only", async () => {
  await renderToday({ ...savedSettings({ preset: "custom" }), settings_set: rejectOutOfRange });
  const brk = screen.getByLabelText("Break minutes");

  fireEvent.change(brk, { target: { value: "90" } });
  fireEvent.blur(brk);
  await settle();

  expect(brk).toHaveAccessibleDescription(BREAK_HELP);
  expect(screen.queryByText(FOCUS_HELP)).toBeNull();
  expect(screen.getByLabelText("Focus minutes")).not.toHaveAccessibleDescription(FOCUS_HELP);
  expect(brk).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  expect(brk).toHaveValue(90);
});

test("focus_out_of_range_shows_focus_helper_only", async () => {
  await renderToday({ ...savedSettings({ preset: "custom" }), settings_set: rejectOutOfRange });
  const focus = screen.getByLabelText("Focus minutes");

  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  await settle();

  expect(focus).toHaveAccessibleDescription(FOCUS_HELP);
  expect(screen.queryByText(BREAK_HELP)).toBeNull();
  expect(screen.getByLabelText("Break minutes")).not.toHaveAccessibleDescription(BREAK_HELP);
});

test("both_out_of_range_show_both_helpers", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: rejectOutOfRange,
  });
  const focus = screen.getByLabelText("Focus minutes");
  const brk = screen.getByLabelText("Break minutes");

  fireEvent.change(focus, { target: { value: "2" } });
  fireEvent.change(brk, { target: { value: "0" } });
  fireEvent.blur(brk);
  await settle();

  expect(argsOf(backend.calls, "settings_set")).toHaveLength(1);
  expect(focus).toHaveAccessibleDescription(FOCUS_HELP);
  expect(brk).toHaveAccessibleDescription(BREAK_HELP);
  expect(screen.getAllByText(FOCUS_HELP)).toHaveLength(1);
  expect(screen.getAllByText(BREAK_HELP)).toHaveLength(1);
});

test("refused_custom_start_shows_helper_on_the_offending_field", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    timer_start: () => Promise.reject(INVALID_SPEC),
  });

  fireEvent.change(screen.getByLabelText("Break minutes"), { target: { value: "75" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: { focusMin: 45, breakMin: 75 } } },
  ]);
  expect(screen.getByLabelText("Break minutes")).toHaveAccessibleDescription(BREAK_HELP);
  expect(screen.queryByText(FOCUS_HELP)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
});

test("committing_the_saved_spec_again_clears_the_break_helper", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: rejectOutOfRange,
  });
  const brk = screen.getByLabelText("Break minutes");

  fireEvent.change(brk, { target: { value: "90" } });
  fireEvent.blur(brk);
  await settle();
  expect(screen.getByText(BREAK_HELP)).toBeInTheDocument();

  fireEvent.change(brk, { target: { value: "10" } });
  fireEvent.blur(brk);
  await settle();

  expect(screen.queryByText(BREAK_HELP)).toBeNull();
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(1);
});

test("successful_start_clears_the_break_helper", async () => {
  let calls = 0;
  await renderToday({
    ...savedSettings({ preset: "custom" }),
    timer_start: () => (calls++ === 0 ? Promise.reject(INVALID_SPEC) : null),
  });
  const brk = screen.getByLabelText("Break minutes");

  fireEvent.change(brk, { target: { value: "75" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();
  expect(screen.getByText(BREAK_HELP)).toBeInTheDocument();

  fireEvent.change(brk, { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(screen.queryByText(BREAK_HELP)).toBeNull();
});

test("refused_start_with_unparsable_draft_shows_both_helpers", async () => {
  await renderToday({
    ...savedSettings({ preset: "custom" }),
    timer_start: () => Promise.reject(INVALID_SPEC),
  });

  fireEvent.change(screen.getByLabelText("Break minutes"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(screen.getByText(FOCUS_HELP)).toBeInTheDocument();
  expect(screen.getByText(BREAK_HELP)).toBeInTheDocument();
});
