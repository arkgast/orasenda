import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BOARD_LINE_MS, useBoardLine } from "./useBoardLine";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("a_repeated_board_line_restarts_the_clock", () => {
  const { result } = renderHook(() => useBoardLine());
  act(() => result.current[1]("Moved it back."));
  act(() => vi.advanceTimersByTime(BOARD_LINE_MS - 1000));
  act(() => result.current[1]("Moved it back."));
  act(() => vi.advanceTimersByTime(BOARD_LINE_MS - 1000));
  expect(result.current[0]?.text).toBe("Moved it back.");
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current[0]).toBeNull();
});
