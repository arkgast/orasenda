import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  argsOf,
  deferred,
  emitMilestone,
  emitTimer,
  IDLE,
  mockBackend,
  PAUSED,
  RUNNING,
  settle,
} from "../../test/fixtures";
import { useSurfaceTimer } from "./useSurfaceTimer";

afterEach(async () => {
  // Unmount (and unlisten) while the IPC mock is still installed.
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

test("use_surface_timer_reads_timer_view_then_ticks", async () => {
  mockBackend({ timer_view: () => RUNNING });
  const { result } = renderHook(() => useSurfaceTimer());
  expect(result.current).toEqual({ view: null, ended: false, failed: false });
  await settle();
  expect(result.current.view).toEqual(RUNNING);
  await emitTimer(PAUSED);
  expect(result.current.view).toEqual(PAUSED);
});

test("use_surface_timer_never_calls_timer_state", async () => {
  const backend = mockBackend({ timer_view: () => IDLE });
  renderHook(() => useSurfaceTimer(), { wrapper: StrictMode });
  await settle();
  await emitTimer(RUNNING);
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  expect(argsOf(backend.calls, "timer_state")).toEqual([]);
  expect(argsOf(backend.calls, "timer_view").length).toBeGreaterThan(0);
  expect(backend.live("timer-tick")).toBe(1);
  expect(backend.live("timer-milestone")).toBe(1);
});

test("use_surface_timer_a_tick_before_the_first_reply_wins", async () => {
  const reply = deferred<typeof IDLE>();
  mockBackend({ timer_view: () => reply.promise });
  const { result } = renderHook(() => useSurfaceTimer());
  await settle();
  await emitTimer(RUNNING);
  reply.resolve(IDLE);
  await settle();
  expect(result.current.view).toEqual(RUNNING);
});

test("use_surface_timer_ended_until_next_start", async () => {
  mockBackend({ timer_view: () => RUNNING });
  const { result } = renderHook(() => useSurfaceTimer());
  await settle();
  await emitMilestone({ kind: "started" });
  expect(result.current.ended).toBe(false);

  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  expect(result.current.ended).toBe(true);
  // The idle view that follows the end keeps it.
  await emitTimer(IDLE);
  expect(result.current.ended).toBe(true);
  // The next non-idle view clears it.
  await emitTimer(RUNNING);
  expect(result.current.ended).toBe(false);
});

test("use_surface_timer_unreadable_view_is_failed_until_a_tick", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({ timer_view: () => Promise.reject({ kind: "store", message: "no timer" }) });
  const { result } = renderHook(() => useSurfaceTimer());
  await settle();
  expect(result.current).toEqual({ view: null, ended: false, failed: true });
  await emitTimer(IDLE);
  expect(result.current).toEqual({ view: IDLE, ended: false, failed: false });
});
