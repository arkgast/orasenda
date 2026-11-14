import { expect, test } from "vitest";
import { capacity, openLanes } from "./useFolds";

const SIZES = { min: 200, strip: 64, gap: 8 };

test("the default window holds three open columns beside the Done strip", () => {
  // 900 less the rail and the page's padding.
  expect(capacity(788, SIZES)).toBe(3);
  expect(capacity(1400, SIZES)).toBe(4);
  expect(capacity(null, SIZES)).toBe(3);
  expect(capacity(500, SIZES)).toBe(1);
});

test("Backlog folds first, then Doing, and Today stays open longest", () => {
  const order = ["backlog", "doing", "today"] as const;
  expect(openLanes(order, 3, null)).toEqual(["backlog", "today", "doing"]);
  expect(openLanes(order, 2, null)).toEqual(["today", "doing"]);
  expect(openLanes(order, 1, null)).toEqual(["today"]);
});

test("the column holding the running task is spared", () => {
  const order = ["backlog", "doing", "today"] as const;
  expect(openLanes(order, 2, "backlog")).toEqual(["backlog", "today"]);
});

test("opening a strip folds the least recently opened column", () => {
  expect(openLanes(["backlog", "doing", "today", "done"], 3, null)).toEqual([
    "today",
    "doing",
    "done",
  ]);
});
