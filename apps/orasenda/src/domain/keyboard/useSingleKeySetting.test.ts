import type { Settings } from "@shared/ipc/bindings";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useSingleKeySetting } from "./useSingleKeySetting";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  watcher: null as null | ((settings: Settings) => void),
}));

vi.mock("@shared/ipc/bindings", () => ({ commands: { settingsGet: mocks.get } }));
vi.mock("@shared/ipc/settingsQueue", () => ({
  watchSettingsChanged: (watcher: (settings: Settings) => void) => {
    mocks.watcher = watcher;
    return () => {
      mocks.watcher = null;
    };
  },
}));

const settings = (singleKey: boolean) => ({ singleKey }) as Settings;

beforeEach(() => {
  mocks.get.mockReset();
  mocks.watcher = null;
});
afterEach(() => vi.restoreAllMocks());

test("off_until_settings_read", async () => {
  let resolve: (value: Settings) => void = () => {};
  mocks.get.mockReturnValue(new Promise<Settings>((r) => (resolve = r)));
  const { result } = renderHook(() => useSingleKeySetting());
  expect(result.current).toEqual({ on: false, failed: false });
  await act(async () => resolve(settings(true)));
  expect(result.current).toEqual({ on: true, failed: false });
});

test("event_beats_late_get", async () => {
  let resolve: (value: Settings) => void = () => {};
  mocks.get.mockReturnValue(new Promise<Settings>((r) => (resolve = r)));
  const { result } = renderHook(() => useSingleKeySetting());
  act(() => mocks.watcher?.(settings(false)));
  await act(async () => resolve(settings(true)));
  expect(result.current.on).toBe(false);
});

test("failed_on_rejected_get", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.get.mockRejectedValue(new Error("nope"));
  const { result } = renderHook(() => useSingleKeySetting());
  await waitFor(() => expect(result.current).toEqual({ on: false, failed: true }));
});

test("next_event_clears_failed", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.get.mockRejectedValue(new Error("nope"));
  const { result } = renderHook(() => useSingleKeySetting());
  await waitFor(() => expect(result.current.failed).toBe(true));
  act(() => mocks.watcher?.(settings(true)));
  expect(result.current).toEqual({ on: true, failed: false });
});

test("logs_once_on_rejected_get", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const cause = new Error("nope");
  mocks.get.mockRejectedValue(cause);
  const { result } = renderHook(() => useSingleKeySetting());
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(error).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith("settings_get failed: single keys stay off", cause);
});
