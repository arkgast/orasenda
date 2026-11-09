import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TimerSettings } from "../bindings";
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
const EXPLANATION = "Orasenda can tell you when a session ends, even when its window is hidden.";

async function renderToday(replies: Replies = {}) {
  const backend = mockBackend(replies);
  const view = render(<Today />);
  await settle();
  return { backend, ...view };
}

function savedSettings(settings: Partial<TimerSettings>): Replies {
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

test("explanation_line_only_while_not_determined", async () => {
  await renderToday({
    timer_state: () => ({ view: { ...IDLE, notifications: "notDetermined" }, pending: [] }),
  });
  const line = screen.getByText(EXPLANATION);
  expect(line.tagName).toBe("P");
  expect(line).toHaveClass("app-muted");

  await emitTimer({ ...IDLE, notifications: "granted" });
  expect(screen.queryByText(EXPLANATION)).toBeNull();

  await emitTimer({ ...IDLE, notifications: "denied" });
  expect(screen.queryByText(EXPLANATION)).toBeNull();
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
      (args as { settings: TimerSettings }).settings.custom.focusMin > 180
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
        preset: "custom",
        custom: { focusMin: 60, breakMin: 10 },
        notifySessionEnd: true,
      },
    },
    {
      settings: {
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
  await act(async () => saving.resolve(null));
  await settle();

  expect(argsOf(backend.calls, "settings_set")).toEqual([
    {
      settings: {
        preset: "custom",
        custom: { focusMin: 60, breakMin: 10 },
        notifySessionEnd: true,
      },
    },
    {
      settings: {
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
      (args as { settings: TimerSettings }).settings.custom.focusMin > 180
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
      const { preset, custom } = (args as { settings: TimerSettings }).settings;
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

// Overlapping saves (#101): newest wins, not last to arrive

const WRITE_FAILED = { kind: "write", message: "disk full" };

/** A settings_set reply held until the test answers it, with either outcome. */
type Held = { promise: Promise<null>; resolve: () => void; reject: (error: unknown) => void };

/** settings_set replies held in call order; `held[i]` answers the i-th save. */
function heldSaves(): { held: Held[]; reply: () => Promise<null> } {
  const held: Held[] = [];
  return {
    held,
    reply: () => {
      let resolve: () => void = () => {};
      let reject: (error: unknown) => void = () => {};
      const promise = new Promise<null>((done, fail) => {
        resolve = () => done(null);
        reject = fail;
      });
      held.push({ promise, resolve, reject });
      return promise;
    },
  };
}

function settingsSent(backend: { calls: { cmd: string; args: unknown }[] }): TimerSettings[] {
  return argsOf(backend.calls, "settings_set").map(
    (args) => (args as { settings: TimerSettings }).settings,
  );
}

test.each([
  ["the failure arrives first", [0, 1]],
  ["the later success arrives first", [1, 0]],
] as const)("stale_failed_save_does_not_roll_back_over_a_later_save: %s", async (_, order) => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { held, reply } = heldSaves();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: reply,
  });
  const focus = screen.getByLabelText("Focus minutes");

  // Save 1 (Custom, 60) will fail; save 2 (50/10, 60) is sent before it answers and succeeds.
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();
  expect(held).toHaveLength(2);

  const answers = [() => held[0].reject(WRITE_FAILED), () => held[1].resolve()];
  for (const index of order) {
    await act(async () => answers[index]());
    await settle();
  }

  // Rust holds fifty_ten with 60 minutes: the screen agrees.
  expect(screen.getByRole("radio", { name: "50/10" })).toBeChecked();
  expect(statusNodes()).toHaveLength(0);
  // The failure is still logged.
  expect(error).toHaveBeenCalledWith("settings_set failed", WRITE_FAILED);

  // The next change builds on what Rust holds, not on the rolled-back settings.
  fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
  await settle();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(60);
  expect(settingsSent(backend)[2]).toEqual({
    preset: "custom",
    custom: { focusMin: 60, breakMin: 10 },
    notifySessionEnd: true,
  });
  await act(async () => held[2].resolve());
});

test("newer_failed_save_rolls_back_to_an_older_save_that_succeeds_later", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { held, reply } = heldSaves();
  await renderToday({ ...savedSettings({ preset: "custom" }), settings_set: reply });
  const focus = screen.getByLabelText("Focus minutes");

  // Save 1 (Custom, 60) succeeds, but only after save 2 (50/10, 60) has failed.
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();

  await act(async () => held[1].reject(WRITE_FAILED));
  await settle();
  await act(async () => held[0].resolve());
  await settle();

  // Rust holds Custom with 60 minutes, the latest state it accepted.
  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(60);
  expect(screen.getByLabelText("Break minutes")).toHaveValue(10);
});

test("older_success_arriving_after_a_newer_success_keeps_the_newer_baseline", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { held, reply } = heldSaves();
  await renderToday({ ...savedSettings({ preset: "custom" }), settings_set: reply });
  const focus = screen.getByLabelText("Focus minutes");

  // Save 1 (Custom, 60) and save 2 (Custom, 70) succeed out of order; save 3 then fails.
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.change(focus, { target: { value: "70" } });
  fireEvent.blur(focus);
  await settle();
  await act(async () => held[1].resolve());
  await act(async () => held[0].resolve());
  await settle();

  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();
  await act(async () => held[2].reject(WRITE_FAILED));
  await settle();

  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  expect(screen.getByLabelText("Focus minutes")).toHaveValue(70);
});

test("stale_invalid_spec_does_not_undo_a_later_custom_save", async () => {
  const { held, reply } = heldSaves();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: reply,
  });
  const focus = screen.getByLabelText("Focus minutes");

  // Save 1 (200) is out of range; save 2 (60) is sent before Rust answers save 1.
  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  await settle();
  await act(async () => held[0].reject(INVALID_SPEC));
  await settle();
  await act(async () => held[1].resolve());
  await settle();

  expect(focus).toHaveValue(60);
  expect(screen.queryByText(RANGE_HELP)).toBeNull();

  fireEvent.click(screen.getByRole("radio", { name: "Classic 25/5" }));
  await settle();
  expect(settingsSent(backend)[2]).toEqual({
    preset: "classic",
    custom: { focusMin: 60, breakMin: 10 },
    notifySessionEnd: true,
  });
  await act(async () => held[2].resolve());
});

test("older_success_after_a_newer_invalid_spec_becomes_the_spec_kept", async () => {
  const { held, reply } = heldSaves();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: reply,
  });
  const focus = screen.getByLabelText("Focus minutes");

  // Save 1 (60) succeeds, but only after save 2 (200) is rejected as out of range.
  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  await settle();
  await act(async () => held[1].reject(INVALID_SPEC));
  await settle();
  await act(async () => held[0].resolve());
  await settle();

  // The typed draft stays beside the helper.
  expect(focus).toHaveValue(200);
  expect(screen.getByText(RANGE_HELP)).toBeInTheDocument();

  // The next change sends the spec Rust holds (60), never the rejected one or the older 45.
  fireEvent.click(screen.getByRole("radio", { name: "Classic 25/5" }));
  await settle();
  expect(settingsSent(backend)[2]).toEqual({
    preset: "classic",
    custom: { focusMin: 60, breakMin: 10 },
    notifySessionEnd: true,
  });
  await act(async () => held[2].resolve());
});
