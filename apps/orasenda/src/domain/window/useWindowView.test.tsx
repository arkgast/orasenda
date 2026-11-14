import {
  emitWindowView,
  fullScreenView,
  mockBackend,
  settle,
  WINDOWED,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useWindowView } from "./useWindowView";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

test("window_view_reads_the_getter_then_follows_the_event", async () => {
  mockBackend({ window_view: () => fullScreenView(2) });
  const { result } = renderHook(() => useWindowView());
  await settle();
  expect(result.current).toEqual(fullScreenView(2));
  await emitWindowView(WINDOWED);
  expect(result.current).toEqual(WINDOWED);
});

test("window_view_failed_getter_stays_windowed_and_logs", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({ window_view: () => Promise.reject(new Error("no")) });
  const { result } = renderHook(() => useWindowView());
  await settle();
  expect(result.current.fullScreen).toBe(false);
  expect(console.error).toHaveBeenCalled();
});
