import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { emitMilestone, emitTimer, IDLE, RUNNING, settle } from "../../test/fixtures";
import { renderToday, statusNodes } from "./Today.support";

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
