import type { BoardView_Serialize } from "@shared/ipc/bindings";
import { argsOf, boardOf, boardTask, settle, withCustom } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { card, renderBoard, TASKS } from "./BoardPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const LATER = [{ lane: "c_later", name: "Later" }];

/** A board whose folds live in `folded`, read back by `board_get` as the real store would. */
function savedFolds(base: BoardView_Serialize, folded: Record<string, boolean>) {
  const board = () => ({
    ...base,
    columns: base.columns.map((c) => ({ ...c, folded: folded[c.lane] ?? c.folded })),
  });
  return {
    board_get: board,
    board_column_fold: (args: unknown) => {
      const { lane, folded: on } = args as { lane: string; folded: boolean };
      folded[lane] = on;
      return null;
    },
  };
}

test("no_fold_for_room", async () => {
  const six = withCustom(boardOf(TASKS), [...LATER, { lane: "c_two", name: "Two" }]);
  const open = { ...six, columns: six.columns.map((c) => ({ ...c, folded: false })) };
  await renderBoard({ board: open });
  expect(screen.getByRole("region", { name: "Board columns" })).toHaveAttribute("data-axis", "x");
  for (const name of ["Backlog", "Today", "Doing", "Later", "Two", "Done"])
    expect(screen.getByRole("region", { name })).toBeInTheDocument();
  expect(document.querySelector('[data-slot="kanban-column-strip"]')).toBeNull();
});

test("done_folded_at_start", async () => {
  await renderBoard();
  expect(screen.getByRole("button", { name: "Done, 1 task" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("fold_saved_and_kept_on_remount", async () => {
  const folded: Record<string, boolean> = {};
  const replies = savedFolds(boardOf(TASKS), folded);
  const backend = await renderBoard({ replies });
  fireEvent.click(screen.getByRole("button", { name: "Done, 1 task" }));
  // Shown at once, saved for the next time.
  expect(screen.getByRole("region", { name: "Done" })).toBeInTheDocument();
  await settle();
  expect(argsOf(backend.calls, "board_column_fold")).toEqual([{ lane: "done", folded: false }]);
  cleanup();
  clearMocks();
  await renderBoard({ replies });
  expect(screen.getByRole("region", { name: "Done" })).toBeInTheDocument();
});

test("fold_write_failure_toasts", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderBoard({
    replies: {
      board_column_fold: () => {
        throw new Error("store");
      },
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Done, 1 task" }));
  await settle();
  expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
  // The fold stays as shown.
  expect(screen.getByRole("region", { name: "Done" })).toBeInTheDocument();
});

test("compact_keeps_vertical_stack", async () => {
  const { innerWidth, innerHeight } = window;
  Object.assign(window, { innerWidth: 360, innerHeight: 600 });
  try {
    await renderBoard();
    expect(screen.getByRole("region", { name: "Board" })).not.toHaveAttribute("data-axis");
    expect(screen.queryByRole("region", { name: "Board columns" })).toBeNull();
  } finally {
    Object.assign(window, { innerWidth, innerHeight });
  }
});

/** jsdom has no scrollIntoView: define it, then spy so the restore removes the spy. */
function scrollSpy() {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  return vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
}

const later = withCustom(boardOf(TASKS), LATER);
const press = (title: string, init: KeyboardEventInit) => {
  card(title).focus();
  fireEvent.keyDown(card(title), init);
};
const heading = (name: string) => screen.getByRole("heading", { name });

test("arrows_reach_empty_custom_column", async () => {
  await renderBoard({ board: later });
  press("Fix sync bug", { key: "ArrowRight" });
  expect(heading("Later")).toHaveFocus();
  // On past it to Done's strip, then back.
  fireEvent.keyDown(heading("Later"), { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Done, 1 task" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("button", { name: "Done, 1 task" }), { key: "ArrowLeft" });
  expect(heading("Later")).toHaveFocus();
  fireEvent.keyDown(heading("Later"), { key: "ArrowLeft" });
  expect(card("Fix sync bug")).toHaveFocus();
});

test("arrows_reach_strip", async () => {
  await renderBoard();
  press("Fix sync bug", { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Done, 1 task" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("button", { name: "Done, 1 task" }), { key: "ArrowLeft" });
  expect(card("Fix sync bug")).toHaveFocus();
});

test("focus_scrolls_column_into_view", async () => {
  const spy = scrollSpy();
  await renderBoard({ board: later });
  press("Fix sync bug", { key: "ArrowRight" });
  expect(spy).toHaveBeenLastCalledWith(
    expect.objectContaining({ inline: "nearest", behavior: "smooth" }),
  );
  expect(spy.mock.contexts.at(-1)).toBe(document.getElementById("board-col-c_later"));
});

test("scroll_into_view_respects_reduce_motion", async () => {
  const spy = scrollSpy();
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    matches: q.includes("reduce"),
    addEventListener() {},
    removeEventListener() {},
  })) as never;
  try {
    await renderBoard({ board: later });
    press("Fix sync bug", { key: "ArrowRight" });
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "auto" }));
  } finally {
    window.matchMedia = original;
  }
});

test("alt_cmd_arrow_moves_through_custom_column", async () => {
  const board = withCustom(boardOf(TASKS), [
    { lane: "c_later", name: "Later", tasks: [boardTask("l1", "Plan trip", "c_later")] },
  ]);
  const backend = await renderBoard({ board });
  press("Fix sync bug", { key: "ArrowRight", metaKey: true, altKey: true });
  await settle();
  expect(argsOf(backend.calls, "task_move")).toEqual([{ id: "d1", lane: "c_later", index: 1 }]);
  fireEvent.click(screen.getByRole("button", { name: "More actions for Write intro" }));
  expect(screen.getByRole("menuitem", { name: "Move to Later" })).toBeInTheDocument();
});
