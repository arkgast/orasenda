import { BOARD } from "@shared/test/fixtures";
import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useFolds } from "./useFolds";

const columns = BOARD.columns;

test("folds come from the columns: Done starts folded", () => {
  const { result } = renderHook(() =>
    useFolds({ columns, save: async () => null, failed: () => {} }),
  );
  expect(result.current.open).toEqual(["backlog", "today", "doing"]);
});

test("a toggle shows at once and is saved", async () => {
  const save = vi.fn(async () => null);
  const { result } = renderHook(() => useFolds({ columns, save, failed: () => {} }));
  act(() => result.current.toggle("done"));
  expect(result.current.open).toContain("done");
  expect(save).toHaveBeenCalledWith("done", false);
});

test("a failed save keeps the shown fold and says so", async () => {
  const failed = vi.fn();
  const { result } = renderHook(() => useFolds({ columns, save: async () => "Nope.", failed }));
  await act(async () => result.current.toggle("today"));
  expect(failed).toHaveBeenCalledWith("Nope.");
  expect(result.current.open).not.toContain("today");
});

test("only the newest toggle of a lane may speak", async () => {
  const failed = vi.fn();
  let first: (v: string | null) => void = () => {};
  const save = vi
    .fn<(lane: string, folded: boolean) => Promise<string | null>>()
    .mockImplementationOnce(() => new Promise((r) => (first = r)))
    .mockResolvedValue(null);
  const { result } = renderHook(() => useFolds({ columns, save, failed }));
  act(() => result.current.toggle("today"));
  await act(async () => result.current.toggle("today"));
  await act(async () => first("Nope."));
  expect(failed).not.toHaveBeenCalled();
  expect(result.current.open).toContain("today");
});

test("a pending fold ends once the board shows it", () => {
  const folded = columns.map((c) => (c.lane === "today" ? { ...c, folded: true } : c));
  const { result, rerender } = renderHook(
    ({ cols }) => useFolds({ columns: cols, save: async () => null, failed: () => {} }),
    { initialProps: { cols: columns } },
  );
  act(() => result.current.toggle("today"));
  expect(result.current.open).not.toContain("today");
  rerender({ cols: folded });
  expect(result.current.open).not.toContain("today");
});
