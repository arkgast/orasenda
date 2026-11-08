import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { type BlockRule, events, type UsageSegment_Serialize } from "../bindings";
import { argsOf, mockBackend } from "./testing";
import { useSpike } from "./useSpike";

const FIRST: UsageSegment_Serialize = {
  bundleId: "com.apple.Safari",
  name: "Safari",
  startMs: Date.UTC(2026, 10, 8, 14, 2),
  endMs: null,
};
const SECOND: UsageSegment_Serialize = {
  bundleId: "com.apple.Notes",
  name: "Notes",
  startMs: Date.UTC(2026, 10, 8, 14, 9),
  endMs: null,
};

afterEach(async () => {
  cleanup();
  await act(async () => {});
  clearMocks();
  vi.restoreAllMocks();
});

test("use_spike_refetches_usage_on_event", async () => {
  let usage = [FIRST];
  const calls = mockBackend({
    spike_status: () => ({ enabled: true, platformSupported: true }),
    spike_running_apps: () => [],
    spike_usage: () => usage,
    spike_rule: () => ({ targets: [], action: "hide" }),
  });
  const { result } = renderHook(() => useSpike());
  await waitFor(() => expect(result.current.usage).toEqual([FIRST]));
  // Let `listen` resolve before emitting.
  await act(async () => {});

  usage = [SECOND, { ...FIRST, endMs: SECOND.startMs }];
  await act(async () => {
    await events.spikeUsageChanged.emit();
  });

  await waitFor(() => expect(result.current.usage).toEqual(usage));
  expect(argsOf(calls, "spike_usage")).toHaveLength(2);
});

test("use_spike_status_failure_logs_error", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({
    spike_status: () => {
      throw new Error("IPC unavailable");
    },
  });
  const { result } = renderHook(() => useSpike());
  await act(async () => {});

  expect(result.current.status).toBeNull();
  expect(error).toHaveBeenCalledTimes(1);
});

test("use_spike_reads_backend_rule_on_mount", async () => {
  const backend = { targets: ["com.apple.Safari"], action: "close" } as const;
  const calls = mockBackend({
    spike_status: () => ({ enabled: true, platformSupported: true }),
    spike_running_apps: () => [],
    spike_usage: () => [],
    spike_rule: () => backend,
    spike_set_rule: () => null,
  });
  const { result } = renderHook(() => useSpike());
  await waitFor(() => expect(result.current.rule).toEqual(backend));

  // A change builds on the backend rule, not on the default.
  await act(async () => {
    await result.current.setRule((latest) => ({ ...latest, action: "hide" }));
  });
  expect(argsOf(calls, "spike_set_rule")).toEqual([
    { rule: { targets: ["com.apple.Safari"], action: "hide" } },
  ]);
});

test("late_rule_read_does_not_override_user_change", async () => {
  let answer: () => void = () => {};
  mockBackend({
    spike_status: () => ({ enabled: true, platformSupported: true }),
    spike_running_apps: () => [],
    spike_usage: () => [],
    spike_rule: () =>
      new Promise((resolve) => {
        answer = () => resolve({ targets: ["com.apple.Safari"], action: "close" });
      }),
    spike_set_rule: () => null,
  });
  const { result } = renderHook(() => useSpike());
  await waitFor(() => expect(result.current.status?.enabled).toBe(true));
  await act(async () => {});

  const mine: BlockRule = { targets: ["com.apple.Notes"], action: "hide" };
  await act(async () => {
    await result.current.setRule(mine);
  });
  await act(async () => {
    answer();
  });

  expect(result.current.rule).toEqual(mine);
});
