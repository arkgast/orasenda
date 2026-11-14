import { BOARD, deferred, emitBoardChanged, mockBackend, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useBoard } from "./useBoard";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

const named = (name: string) => ({ ...BOARD, today: name });

test("loads the board from board_get", async () => {
  mockBackend({ board_get: () => named("first") });
  const { result } = renderHook(() => useBoard());
  expect(result.current.board.status).toBe("loading");
  await settle();
  expect(result.current.board).toEqual({ status: "ok", board: named("first") });
});

test("a board that cannot be read is an error, never an empty board", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({
    board_get: () => {
      throw new Error("store");
    },
  });
  const { result } = renderHook(() => useBoard());
  await settle();
  expect(result.current.board).toEqual({ status: "error" });
});

test("the newest seq wins, whatever order the events arrive in", async () => {
  mockBackend({ board_get: () => named("read") });
  const { result } = renderHook(() => useBoard());
  await settle();
  await emitBoardChanged(5, named("five"));
  await emitBoardChanged(4, named("four"));
  expect(result.current.board).toEqual({ status: "ok", board: named("five") });
  await emitBoardChanged(6, named("six"));
  expect(result.current.board).toEqual({ status: "ok", board: named("six") });
});

test("an answer asked for before an event is not shown over it", async () => {
  const slow = deferred<unknown>();
  mockBackend({ board_get: () => slow.promise });
  const { result } = renderHook(() => useBoard());
  await settle();
  await emitBoardChanged(1, named("event"));
  slow.resolve(named("late"));
  await settle();
  expect(result.current.board).toEqual({ status: "ok", board: named("event") });
});
