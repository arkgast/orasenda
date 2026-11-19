import { describe, expect, test } from "vitest";
import { edgeZone, edgeZoneX, type LaneRects, moveIndex, targetAt } from "./dragGeometry";

const card = (id: string, top: number) => ({
  id,
  rect: { left: 0, top, right: 100, bottom: top + 50 },
});
const column = (over: Partial<LaneRects> & Pick<LaneRects, "lane">): LaneRects => ({
  rect: { left: 0, top: 0, right: 100, bottom: 600 },
  folded: false,
  lead: 0,
  count: 0,
  cards: [],
  ...over,
});
// Midpoints: t1 65, t2 125, t3 185.
const today = column({
  lane: "today",
  cards: [card("t1", 40), card("t2", 100), card("t3", 160)],
});
const NONE = { region: 0, x: 0, lanes: {} };

describe("targetAt", () => {
  test("target_between_midpoints", () => {
    const at = (y: number) => targetAt([today], NONE, { x: 50, y }, "x");
    expect(at(60)).toEqual({ lane: "today", index: 0 });
    expect(at(66)).toEqual({ lane: "today", index: 1 });
    expect(at(124)).toEqual({ lane: "today", index: 1 });
    expect(at(126)).toEqual({ lane: "today", index: 2 });
    expect(at(500)).toEqual({ lane: "today", index: 3 });
  });

  test("target_skips_dragged_card", () => {
    // Over the dragged card's own upper half, the next card still decides: slot after it.
    expect(targetAt([today], NONE, { x: 50, y: 60 }, "t1")).toEqual({ lane: "today", index: 1 });
    // Over t2 with t2 dragged: t3's midpoint decides.
    expect(targetAt([today], NONE, { x: 50, y: 100 }, "t2")).toEqual({ lane: "today", index: 2 });
    expect(targetAt([today], NONE, { x: 50, y: 500 }, "t3")).toEqual({ lane: "today", index: 3 });
  });

  test("a leading field counts as child 0", () => {
    const backlog = column({ lane: "backlog", lead: 1, cards: [card("b1", 100)] });
    expect(targetAt([backlog], NONE, { x: 50, y: 10 }, "x")).toEqual({ lane: "backlog", index: 1 });
    expect(targetAt([backlog], NONE, { x: 50, y: 400 }, "x")).toEqual({
      lane: "backlog",
      index: 2,
    });
  });

  test("drop_index_skips_field in any column", () => {
    const today = column({ lane: "today", lead: 1, cards: [card("t1", 100)] });
    expect(targetAt([today], NONE, { x: 50, y: 110 }, "x")).toEqual({ lane: "today", index: 1 });
    expect(moveIndex([today], { lane: "today", index: 1 }, "x")).toBe(0);
  });

  test("target_done_is_top", () => {
    const done = column({ lane: "done", cards: [card("x1", 40), card("x2", 100)] });
    expect(targetAt([done], NONE, { x: 50, y: 500 }, "x")).toEqual({ lane: "done", index: 0 });
    expect(moveIndex([done], { lane: "done", index: 0 }, "x")).toBe(0);
  });

  test("a folded strip takes the end of its column", () => {
    const strip = column({ lane: "backlog", folded: true, count: 4 });
    expect(targetAt([strip], NONE, { x: 50, y: 10 }, "x")).toEqual({ lane: "backlog", index: 4 });
    expect(moveIndex([strip], { lane: "backlog", index: 4 }, "x")).toBe(4);
  });

  test("target_with_scroll_offset", () => {
    // Scrolled 50 down inside the column: t1's midpoint is at 15, t2's at 75.
    const scroll = { region: 0, x: 0, lanes: { today: 50 } };
    expect(targetAt([today], scroll, { x: 50, y: 60 }, "x")).toEqual({ lane: "today", index: 1 });
    // The page region scrolling moves the column and its cards together.
    const region = { region: 100, x: 0, lanes: {} };
    expect(targetAt([today], region, { x: 50, y: 700 }, "x")).toBeNull();
    expect(targetAt([today], region, { x: 50, y: 100 }, "x")).toEqual({ lane: "today", index: 3 });
  });

  test("outside every column is null", () => {
    expect(targetAt([today], NONE, { x: 150, y: 100 }, "x")).toBeNull();
    expect(targetAt([], NONE, { x: 0, y: 0 }, "x")).toBeNull();
  });
});

describe("moveIndex", () => {
  test("counts without the dragged card and the leading field", () => {
    const backlog = column({
      lane: "backlog",
      lead: 1,
      cards: [card("b1", 100), card("b2", 160), card("b3", 220)],
    });
    // Slot before b3 (child 3), b1 dragged: b2 then the slot, so place 1 (0-based).
    expect(moveIndex([backlog], { lane: "backlog", index: 3 }, "b1")).toBe(1);
    // Another column's card: b1, b2, then the slot.
    expect(moveIndex([backlog], { lane: "backlog", index: 3 }, "z")).toBe(2);
  });
});

test("edge_zone_top_and_bottom", () => {
  const rect = { left: 0, top: 100, right: 100, bottom: 500 };
  expect(edgeZone(rect, { x: 50, y: 110 }, 44)).toBe(-1);
  expect(edgeZone(rect, { x: 50, y: 490 }, 44)).toBe(1);
  expect(edgeZone(rect, { x: 50, y: 300 }, 44)).toBe(0);
  expect(edgeZone(rect, { x: 150, y: 110 }, 44)).toBe(0);
  expect(edgeZone(rect, { x: 50, y: 50 }, 44)).toBe(0);
  // A short list never gives more than half to either edge.
  expect(edgeZone({ left: 0, top: 0, right: 10, bottom: 40 }, { x: 5, y: 19 }, 44)).toBe(-1);
  expect(edgeZone({ left: 0, top: 0, right: 10, bottom: 40 }, { x: 5, y: 21 }, 44)).toBe(1);
});

test("drag_geometry_with_scroll_left", () => {
  const far = column({ lane: "today", rect: { left: 600, top: 0, right: 800, bottom: 600 } });
  const at = (x: number, scrolled: number) =>
    targetAt([far], { region: 0, x: scrolled, lanes: {} }, { x, y: 300 }, "z");
  expect(at(710, 0)?.lane).toBe("today");
  // Scrolled 100 to the right, the column now sits at 500-700.
  expect(at(710, 100)).toBeNull();
  expect(at(550, 100)?.lane).toBe("today");
});

test("edgeZoneX reads the left and right zones of the region", () => {
  const rect = { left: 0, top: 0, right: 900, bottom: 600 };
  expect(edgeZoneX(rect, { x: 10, y: 300 }, 44)).toBe(-1);
  expect(edgeZoneX(rect, { x: 890, y: 300 }, 44)).toBe(1);
  expect(edgeZoneX(rect, { x: 450, y: 300 }, 44)).toBe(0);
  expect(edgeZoneX(rect, { x: 890, y: 700 }, 44)).toBe(0);
});
