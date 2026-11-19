import { argsOf, boardOf, settle, withCustom } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  card,
  pointer,
  renderBoard,
  stubPointerCapture,
  stubRects,
  TASKS,
} from "./BoardPage.support";

// Layout (see stubRects): Backlog 0-200, Today 210-410, Doing 420-620, Done strip 630-670.
// Today: t1 y 40-90, t2 y 100-150. Doing: d1 y 40-90. Backlog: cards from y 100.
const T1 = { x: 300, y: 60 };

beforeEach(() => {
  stubRects();
  stubPointerCapture();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

/** Presses `title`, moves past the threshold, then on through `path`; leaves the button down. */
function lift(title: string, from: { x: number; y: number }, ...path: [number, number][]) {
  const el = card(title);
  pointer("pointerdown", el, from.x, from.y);
  pointer("pointermove", el, from.x, from.y + 10);
  for (const [x, y] of path) pointer("pointermove", el, x, y);
  return el;
}

const moves = (backend: Awaited<ReturnType<typeof renderBoard>>) =>
  argsOf(backend.calls, "task_move");

test("click_below_threshold_selects", async () => {
  const onOpenTask = vi.fn();
  await renderBoard({ onOpenTask });
  const el = card("Write intro");
  pointer("pointerdown", el, 300, 60);
  pointer("pointermove", el, 303, 62);
  pointer("pointerup", el, 303, 62);
  fireEvent.click(el);
  fireEvent.doubleClick(el);
  // A press that stayed put is a plain click and double click.
  expect(onOpenTask).toHaveBeenCalledWith("t1");
  expect(screen.queryByText(/Esc puts it back/)).toBeNull();
  expect(el).toHaveAccessibleName(/Selected/);
});

test("touch_is_ignored", async () => {
  const backend = await renderBoard();
  const el = card("Write intro");
  pointer("pointerdown", el, 300, 60, { pointerType: "touch" });
  pointer("pointermove", el, 300, 90, { pointerType: "touch" });
  pointer("pointerup", el, 300, 90, { pointerType: "touch" });
  expect(screen.queryByText(/Esc puts it back/)).toBeNull();
  expect(moves(backend)).toEqual([]);
});

test("drag_moves_between_columns", async () => {
  const backend = await renderBoard();
  const el = lift("Write intro", T1, [500, 200]);
  expect(Element.prototype.setPointerCapture).toHaveBeenCalledWith(1);
  // The card stays where it is, marked Moving, with the slot in Doing.
  expect(card("Write intro")).toHaveAccessibleName(/Moving/);
  expect(screen.getByText("Moving Write intro here")).toBeInTheDocument();
  pointer("pointerup", el, 500, 200);
  await settle();
  expect(moves(backend)).toEqual([{ id: "t1", lane: "doing", index: 1 }]);
  expect(screen.getByText("Moved Write intro to Doing.")).toBeInTheDocument();
});

test("drag_reorders_within_column", async () => {
  const backend = await renderBoard();
  const el = lift("Write intro", T1, [300, 200]);
  pointer("pointerup", el, 300, 200);
  await settle();
  expect(moves(backend)).toEqual([{ id: "t1", lane: "today", index: 1 }]);
  expect(screen.getByText("Moved Write intro to place 2 in Today.")).toBeInTheDocument();
  expect(card("Write intro")).toHaveFocus();
});

test("release_on_own_place_cancels", async () => {
  const backend = await renderBoard();
  // Between t1's midpoint and t2's: the slot would sit right below the card itself.
  const el = lift("Write intro", T1, [300, 95]);
  expect(screen.queryByText("Moving Write intro here")).toBeNull();
  pointer("pointerup", el, 300, 95);
  await settle();
  expect(moves(backend)).toEqual([]);
  expect(screen.getByText("Write intro stayed in Today.")).toBeInTheDocument();
});

test("drop_in_done_goes_to_top", async () => {
  const backend = await renderBoard();
  const el = lift("Write intro", T1, [650, 300]);
  expect(screen.getByRole("button", { name: /^Done.*Move here/ })).toBeInTheDocument();
  pointer("pointerup", el, 650, 300);
  await settle();
  expect(moves(backend)).toEqual([{ id: "t1", lane: "done", index: 0 }]);
});

test("done_to_done_cancels", async () => {
  const backend = await renderBoard();
  // Nothing folds for room: Done opens beside Doing at 630-830, its card at y 40-90.
  fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
  await settle();
  const el = lift("Ship release", { x: 700, y: 60 }, [700, 300]);
  expect(screen.queryByText("Moving Ship release here")).toBeNull();
  pointer("pointerup", el, 700, 300);
  await settle();
  expect(moves(backend)).toEqual([]);
  expect(screen.getByText("Ship release stayed in Done.")).toBeInTheDocument();
});

test("drop_on_folded_strip", async () => {
  const backend = await renderBoard();
  fireEvent.click(screen.getByRole("button", { name: "Fold Backlog" }));
  await settle();
  // Backlog is the strip now (x 0-40) and Today 50-250: a drop on the strip lands after its two cards.
  const el = lift("Write intro", { x: 100, y: 60 }, [20, 300]);
  expect(screen.getByRole("button", { name: /^Backlog.*Move here/ })).toBeInTheDocument();
  pointer("pointerup", el, 20, 300);
  await settle();
  expect(moves(backend)).toEqual([{ id: "t1", lane: "backlog", index: 2 }]);
});

test("esc_cancels_and_is_consumed", async () => {
  const backend = await renderBoard();
  const seen = vi.fn();
  document.addEventListener("keydown", seen);
  const el = lift("Write intro", T1, [500, 200]);
  fireEvent.keyDown(el, { key: "Escape" });
  document.removeEventListener("keydown", seen);
  expect(seen).not.toHaveBeenCalled();
  expect(screen.getByText("Write intro stayed in Today.")).toBeInTheDocument();
  // The release that follows drops nothing.
  pointer("pointerup", el, 500, 200);
  await settle();
  expect(moves(backend)).toEqual([]);
});

test("pointercancel_cancels", async () => {
  const backend = await renderBoard();
  const el = lift("Write intro", T1, [500, 200]);
  pointer("pointercancel", el, 500, 200);
  await settle();
  expect(moves(backend)).toEqual([]);
  expect(screen.getByText("Write intro stayed in Today.")).toBeInTheDocument();
});

test("blur_cancels", async () => {
  const backend = await renderBoard();
  const el = lift("Write intro", T1, [500, 200]);
  fireEvent(window, new Event("blur"));
  pointer("pointerup", el, 500, 200);
  await settle();
  expect(moves(backend)).toEqual([]);
  expect(screen.getByText("Write intro stayed in Today.")).toBeInTheDocument();
});

test("release_outside_cancels", async () => {
  const backend = await renderBoard();
  const el = lift("Write intro", T1, [900, 900]);
  pointer("pointerup", el, 900, 900);
  await settle();
  expect(moves(backend)).toEqual([]);
  expect(screen.getByText("Write intro stayed in Today.")).toBeInTheDocument();
});

test("click_after_drag_swallowed", async () => {
  const onOpenTask = vi.fn();
  await renderBoard({ onOpenTask });
  const el = lift("Write intro", T1, [300, 95]);
  pointer("pointerup", el, 300, 95);
  fireEvent.click(el);
  fireEvent.doubleClick(el);
  expect(onOpenTask).not.toHaveBeenCalled();
});

test("drag_announces_in_words", async () => {
  await renderBoard();
  const el = lift("Write intro", T1);
  expect(screen.getByText("Moving Write intro. Esc puts it back.")).toBeInTheDocument();
  fireEvent.keyDown(el, { key: "Escape" });
  expect(screen.getByText("Write intro stayed in Today.")).toBeInTheDocument();
});

test("keyboard_reorder_stays_silent", async () => {
  const backend = await renderBoard();
  card("Write intro").focus();
  fireEvent.keyDown(card("Write intro"), { key: "ArrowDown", metaKey: true, altKey: true });
  await settle();
  expect(moves(backend)).toEqual([{ id: "t1", lane: "today", index: 1 }]);
  expect(screen.queryByText(/Moved/)).toBeNull();
});

test("drop_past_limit_allowed", async () => {
  // Doing holds one and its limit is one: the drop is allowed and nothing moves back.
  const backend = await renderBoard();
  const el = lift("Write intro", T1, [500, 200]);
  pointer("pointerup", el, 500, 200);
  await settle();
  expect(moves(backend)).toEqual([{ id: "t1", lane: "doing", index: 1 }]);
  expect(moves(backend)).toHaveLength(1);
});

test("no_drag_under_open_sheet", async () => {
  await renderBoard();
  fireEvent.keyDown(card("Reply to Ana"), { key: "Enter" });
  await settle();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  // The dialog makes the board inert to the accessibility tree; the button is still there.
  const el = screen.getByRole("button", { name: /^Write intro/, hidden: true });
  pointer("pointerdown", el, 300, 60);
  pointer("pointermove", el, 300, 90);
  expect(screen.queryByText(/Esc puts it back/)).toBeNull();
});

test("drag_into_custom_column", async () => {
  // Layout: Backlog 0-200, Today 210-410, Doing 420-620, Later 630-830, Done strip 840-880.
  const board = withCustom(boardOf(TASKS), [{ lane: "c_later", name: "Later" }]);
  const backend = await renderBoard({ board });
  const el = lift("Write intro", T1, [700, 200]);
  expect(screen.getByText("Moving Write intro here")).toBeInTheDocument();
  pointer("pointerup", el, 700, 200);
  await settle();
  expect(moves(backend)).toEqual([{ id: "t1", lane: "c_later", index: 0 }]);
});

function stubRegion(region: HTMLElement, start: number) {
  const box = { left: start };
  Object.defineProperties(region, {
    scrollWidth: { value: 2000 },
    clientWidth: { value: 900 },
    scrollLeft: {
      get: () => box.left,
      set: (v: number) => {
        box.left = v;
      },
    },
  });
  return box;
}

test("drag_edge_scrolls_region", async () => {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => queue.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // jsdom loads no stylesheet: the sideways edge zone is the column-strip-width token.
  document.documentElement.style.setProperty("--hit-min", "44px");
  document.documentElement.style.setProperty("--column-strip-width", "64px");
  try {
    await renderBoard();
    const box = stubRegion(screen.getByRole("region", { name: "Board columns" }), 0);
    // Inside 64px of the region's right edge, outside hit-min (stubRects: the region is 900 wide).
    const el = lift("Write intro", T1, [850, 300]);
    queue.shift()?.(0);
    expect(box.left).toBeGreaterThan(0);
    pointer("pointerup", el, 850, 300);
  } finally {
    document.documentElement.style.removeProperty("--hit-min");
    document.documentElement.style.removeProperty("--column-strip-width");
    vi.unstubAllGlobals();
  }
});

test("drag_drop_follows_region_scroll", async () => {
  const board = withCustom(boardOf(TASKS), [{ lane: "c_later", name: "Later" }]);
  const backend = await renderBoard({ board });
  const box = stubRegion(screen.getByRole("region", { name: "Board columns" }), 300);
  const el = lift("Write intro", T1, [700, 200]);
  // The region scrolls back 300 after the lift: the pointer is now over Today (210-410).
  box.left = 0;
  pointer("pointermove", el, 701, 200);
  pointer("pointerup", el, 701, 200);
  await settle();
  expect(moves(backend)).toEqual([{ id: "t1", lane: "today", index: expect.any(Number) }]);
});
