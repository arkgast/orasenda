import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MilestoneEvent_Serialize, TimerState_Serialize } from "../../ipc/bindings";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import {
  argsOf,
  deferred,
  emitMilestone,
  emitTimer,
  IDLE,
  mockBackend,
  RUNNING,
  settle,
} from "../../test/fixtures";
import { useTimer } from "./useTimer";

const RECOVERED: MilestoneEvent_Serialize = {
  kind: "recovered",
  endReason: "completed",
  sessionId: "s0",
};

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

test("initial_view_is_ignored_when_a_tick_already_arrived", async () => {
  const reply = deferred<TimerState_Serialize>();
  mockBackend({ timer_state: () => reply.promise });
  const { result } = renderHook(() => useTimer({ onMilestone: () => {} }));
  await settle();
  expect(result.current).toEqual({ status: "waiting" });

  await emitTimer(RUNNING);
  await act(async () => reply.resolve({ view: IDLE, pending: [] }));

  expect(result.current).toEqual({ status: "ok", view: RUNNING });
});

test("initial_view_is_used_before_any_tick", async () => {
  mockBackend({ timer_state: () => ({ view: RUNNING, pending: [] }) });
  const { result } = renderHook(() => useTimer({ onMilestone: () => {} }));
  await settle();

  expect(result.current).toEqual({ status: "ok", view: RUNNING });
});

test("subscribes_before_calling_timer_state", async () => {
  const order: string[] = [];
  const backend = mockBackend({
    timer_state: () => {
      order.push(
        `timer_state after ${backend.listens("timer-tick")}+${backend.listens("timer-milestone")} listens`,
      );
      return { view: IDLE, pending: [] };
    },
  });
  renderHook(() => useTimer({ onMilestone: () => {} }));
  await settle();

  expect(order).toEqual(["timer_state after 1+1 listens"]);
});

test("recovered_pending_event_survives_strict_mode_double_mount", async () => {
  const replies = [deferred<TimerState_Serialize>(), deferred<TimerState_Serialize>()];
  let call = 0;
  const backend = mockBackend({ timer_state: () => replies[call++]?.promise });
  const onMilestone = vi.fn();
  renderHook(() => useTimer({ onMilestone }), { wrapper: StrictMode });
  await settle();
  // Mount 1 asked, was cleaned up; mount 2 registered and asked again.
  expect(argsOf(backend.calls, "timer_state")).toHaveLength(2);

  // Reply A (mount 1's, which drained `pending`) lands only now.
  await act(async () => replies[0]?.resolve({ view: IDLE, pending: [RECOVERED] }));
  await act(async () => replies[1]?.resolve({ view: IDLE, pending: [] }));

  expect(onMilestone).toHaveBeenCalledTimes(1);
  expect(onMilestone).toHaveBeenCalledWith(RECOVERED);
});

test("pending_event_with_no_live_instance_waits_for_the_next_mount", async () => {
  const reply = deferred<TimerState_Serialize>();
  let call = 0;
  mockBackend({ timer_state: () => (call++ === 0 ? reply.promise : { view: IDLE, pending: [] }) });
  const first = vi.fn();
  const { unmount } = renderHook(() => useTimer({ onMilestone: first }));
  await settle();
  unmount();
  await act(async () => reply.resolve({ view: IDLE, pending: [RECOVERED] }));
  expect(first).not.toHaveBeenCalled();

  const second = vi.fn();
  renderHook(() => useTimer({ onMilestone: second }));
  await settle();

  expect(second).toHaveBeenCalledExactlyOnceWith(RECOVERED);
});

test("new_on_milestone_identity_does_not_resubscribe", async () => {
  const backend = mockBackend();
  const first = vi.fn();
  const { rerender } = renderHook(({ onMilestone }) => useTimer({ onMilestone }), {
    initialProps: { onMilestone: first },
  });
  await settle();

  const second = vi.fn();
  rerender({ onMilestone: second });
  await settle();
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });

  expect(backend.listens("timer-tick")).toBe(1);
  expect(backend.listens("timer-milestone")).toBe(1);
  expect(argsOf(backend.calls, "timer_state")).toHaveLength(1);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledExactlyOnceWith({
    kind: "ended",
    endReason: "completed",
    sessionId: "s1",
  });
});

test("rejected_timer_state_is_error", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({
    timer_state: () => {
      throw new Error("timer_state not allowed");
    },
  });
  const { result } = renderHook(() => useTimer({ onMilestone: () => {} }));
  await settle();

  expect(result.current).toEqual({ status: "error" });
  expect(error).toHaveBeenCalledTimes(1);
});

test("rejected_timer_tick_listen_is_error", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({}, { failListen: "timer-tick" });
  const { result } = renderHook(() => useTimer({ onMilestone: () => {} }));
  await settle();

  expect(result.current).toEqual({ status: "error" });
  expect(error).toHaveBeenCalledTimes(1);
});
