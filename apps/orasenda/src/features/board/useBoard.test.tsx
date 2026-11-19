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

test("the column commands reach Rust and answer typed", async () => {
  const calls: unknown[] = [];
  mockBackend({
    board_get: () => BOARD,
    board_column_add: (args: unknown) => {
      calls.push(["add", args]);
      return "c_ab12cd34";
    },
    board_column_edit: (args: unknown) => {
      calls.push(["edit", args]);
      return null;
    },
    board_column_remove: (args: unknown) => {
      calls.push(["remove", args]);
      return null;
    },
    board_column_fold: (args: unknown) => {
      calls.push(["fold", args]);
      return null;
    },
  });
  const { result } = renderHook(() => useBoard());
  await settle();
  expect(await result.current.addColumn("today")).toEqual({ status: "ok", data: "c_ab12cd34" });
  expect((await result.current.editColumn("c_ab12cd34", "Review", 2)).status).toBe("ok");
  expect((await result.current.foldColumn("done", false)).status).toBe("ok");
  expect((await result.current.removeColumn("c_ab12cd34")).status).toBe("ok");
  expect(calls).toEqual([
    ["add", { after: "today" }],
    ["edit", { lane: "c_ab12cd34", name: "Review", limit: 2 }],
    ["fold", { lane: "done", folded: false }],
    ["remove", { lane: "c_ab12cd34" }],
  ]);
});

test("addColumn answers the refusal when Rust refuses", async () => {
  mockBackend({
    board_get: () => BOARD,
    board_column_add: () => {
      throw "tooManyColumns";
    },
  });
  const { result } = renderHook(() => useBoard());
  await settle();
  expect(await result.current.addColumn("today")).toEqual({
    status: "error",
    error: "tooManyColumns",
  });
});
