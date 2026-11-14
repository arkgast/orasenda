import { mockBackend, settle } from "@shared/test/fixtures";
import { emitBackupsChanged, OVERVIEW } from "@shared/test/fixtures/data";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useDataOverview } from "./useDataOverview";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

test("data_overview_reads_once_on_mount", async () => {
  const backend = mockBackend();
  const { result } = renderHook(() => useDataOverview());
  expect(result.current.overview).toBeNull();
  await settle();
  expect(result.current.overview).toEqual(OVERVIEW);
  expect(result.current.error).toBe(false);
  expect(backend.calls.filter((c) => c.cmd === "data_overview")).toHaveLength(1);
});

test("data_overview_refreshes_on_backups_changed", async () => {
  mockBackend();
  const { result } = renderHook(() => useDataOverview());
  await settle();
  const next = { ...OVERVIEW, totalBytes: 1, backups: [] };
  await emitBackupsChanged(next);
  expect(result.current.overview).toEqual(next);
});

test("data_overview_failure_sets_error_and_refresh_recovers", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  mockBackend({
    data_overview: () => (fail ? Promise.reject(new Error("no")) : OVERVIEW),
  });
  const { result } = renderHook(() => useDataOverview());
  await settle();
  expect(result.current.error).toBe(true);
  expect(result.current.overview).toBeNull();
  fail = false;
  await act(async () => result.current.refresh());
  await settle();
  expect(result.current.error).toBe(false);
  expect(result.current.overview).toEqual(OVERVIEW);
});

test("data_overview_stops_listening_on_unmount", async () => {
  mockBackend();
  const { result, unmount } = renderHook(() => useDataOverview());
  await settle();
  unmount();
  await emitBackupsChanged({ ...OVERVIEW, totalBytes: 7 });
  expect(result.current.overview).toEqual(OVERVIEW);
});

test("data_overview_newest_reply_wins_when_an_older_one_lands_last", async () => {
  const replies: Array<(value: typeof OVERVIEW) => void> = [];
  mockBackend({ data_overview: () => new Promise((resolve) => replies.push(resolve)) });
  const { result } = renderHook(() => useDataOverview());
  await settle();
  await act(async () => result.current.refresh());
  const newer = { ...OVERVIEW, totalBytes: 9 };
  await act(async () => {
    replies[1]?.(newer);
    replies[0]?.(OVERVIEW);
  });
  await settle();
  expect(result.current.overview).toEqual(newer);
});
