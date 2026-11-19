import type { BoardView_Serialize } from "@shared/ipc/bindings";
import {
  argsOf,
  boardOf,
  boardTask,
  emitBoardChanged,
  settle,
  withCustom,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
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
// The name is a button inside the heading once a column can be edited.
const heading = (name: string) => screen.getByRole("button", { name });

test("arrows_reach_empty_custom_column", async () => {
  await renderBoard({ board: later });
  press("Fix sync bug", { key: "ArrowRight" });
  expect(heading("Later")).toHaveFocus();
  // On through its Fold and + to Done's strip, then back to its name.
  fireEvent.keyDown(heading("Later"), { key: "ArrowRight" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Fold Later" }), { key: "ArrowRight" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Add task to Later" }), {
    key: "ArrowRight",
  });
  expect(screen.getByRole("button", { name: "Done, 1 task" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("button", { name: "Done, 1 task" }), { key: "ArrowLeft" });
  expect(heading("Later")).toHaveFocus();
  // Before the name: the last stop of the column before.
  fireEvent.keyDown(heading("Later"), { key: "ArrowLeft" });
  expect(screen.getByRole("button", { name: "Add task to Doing" })).toHaveFocus();
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
    expect.objectContaining({ block: "nearest", inline: "nearest", behavior: "smooth" }),
  );
  expect(spy.mock.contexts.at(-1)).toBe(heading("Later"));
});

test("compact_arrow_scrolls_focused_card_into_view", async () => {
  const spy = scrollSpy();
  const { innerWidth, innerHeight } = window;
  Object.assign(window, { innerWidth: 360, innerHeight: 600 });
  try {
    await renderBoard();
    expect(screen.getByRole("region", { name: "Board" })).not.toHaveAttribute("data-axis");
    press("Fix sync bug", { key: "ArrowRight" });
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ block: "nearest" }));
    expect(spy.mock.contexts.at(-1)).toBe(document.activeElement);
  } finally {
    Object.assign(window, { innerWidth, innerHeight });
  }
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

// Column editor (B7b)
const nameButton = (name: string) =>
  within(screen.getByRole("region", { name })).getByRole("button", { name });
const openEditor = (name: string) => fireEvent.doubleClick(nameButton(name));
const editor = () => screen.getByRole("group", { name: "Edit column" });
const field = () => screen.getByRole("textbox", { name: "Column name" });
const inEditor = (name: string) => within(editor()).getByRole("button", { name });
const FOUR = [
  { lane: "c_one", name: "One" },
  { lane: "c_two", name: "Two" },
  { lane: "c_three", name: "Three" },
  { lane: "c_four", name: "Four" },
];
const edits = {
  board_column_edit: () => null,
  board_column_add: () => "c_new00001",
  board_column_remove: () => null,
};

test("editor_opens_on_double_click", async () => {
  await renderBoard({ replies: edits });
  fireEvent.click(nameButton("Today"), { detail: 1 });
  expect(screen.queryByRole("group", { name: "Edit column" })).toBeNull();
  openEditor("Today");
  expect(editor()).toBeInTheDocument();
  expect(field()).toHaveValue("Today");
  expect(field()).toHaveFocus();
});

test("editor_opens_on_return", async () => {
  await renderBoard({ replies: edits });
  nameButton("Doing").focus();
  fireEvent.click(nameButton("Doing"), { detail: 0 });
  expect(field()).toHaveValue("Doing");
});

test("editor_controls_per_column_kind", async () => {
  await renderBoard({ board: withCustom(boardOf(TASKS), LATER), replies: edits });
  const kinds: [string, { limit: boolean; add: boolean; remove: boolean }][] = [
    ["Backlog", { limit: false, add: true, remove: false }],
    ["Today", { limit: true, add: true, remove: false }],
    ["Doing", { limit: true, add: true, remove: false }],
    ["Later", { limit: true, add: true, remove: true }],
  ];
  for (const [name, want] of kinds) {
    openEditor(name);
    const has = (label: string) => within(editor()).queryByRole("button", { name: label }) !== null;
    expect(within(editor()).queryByRole("spinbutton", { name: /Limit/ }) !== null).toBe(want.limit);
    expect(has("Add column after")).toBe(want.add);
    expect(has("Remove column")).toBe(want.remove);
    fireEvent.keyDown(field(), { key: "Escape" });
    await settle();
  }
  // Done is folded at start: open it, then it has a name, no limit, no Add.
  fireEvent.click(screen.getByRole("button", { name: "Done, 1 task" }));
  openEditor("Done");
  expect(within(editor()).queryByRole("button", { name: "Add column after" })).toBeNull();
  expect(within(editor()).queryByRole("spinbutton", { name: /Limit/ })).toBeNull();
  // Another column's name is taken, this one's is not.
  fireEvent.change(field(), { target: { value: "today" } });
  expect(screen.getByText("Another column has that name.")).toBeInTheDocument();
});

test("editor_save_calls_edit", async () => {
  const backend = await renderBoard({ replies: edits });
  openEditor("Today");
  fireEvent.change(field(), { target: { value: " Focus " } });
  fireEvent.keyDown(field(), { key: "Enter" });
  await settle();
  expect(argsOf(backend.calls, "board_column_edit")).toEqual([
    { lane: "today", name: "Focus", limit: 3 },
  ]);
  expect(screen.queryByRole("group", { name: "Edit column" })).toBeNull();
  expect(nameButton("Today")).toBeInTheDocument();
});

test("editor_unchanged_save_writes_nothing", async () => {
  const backend = await renderBoard({ replies: edits });
  openEditor("Today");
  fireEvent.keyDown(field(), { key: "Enter" });
  await settle();
  expect(argsOf(backend.calls, "board_column_edit")).toEqual([]);
  expect(screen.queryByRole("group", { name: "Edit column" })).toBeNull();
});

test("editor_esc_writes_nothing_and_returns_focus", async () => {
  const backend = await renderBoard({ replies: edits });
  openEditor("Today");
  fireEvent.change(field(), { target: { value: "Other" } });
  fireEvent.keyDown(field(), { key: "Escape" });
  await settle();
  expect(argsOf(backend.calls, "board_column_edit")).toEqual([]);
  expect(nameButton("Today")).toHaveFocus();
});

test("editor_service_refusal_inline", async () => {
  await renderBoard({
    replies: {
      board_column_edit: () => {
        throw "badColumnName";
      },
    },
  });
  openEditor("Today");
  fireEvent.change(field(), { target: { value: "Focus" } });
  fireEvent.keyDown(field(), { key: "Enter" });
  await settle();
  expect(editor()).toBeInTheDocument();
  expect(screen.getByText("Another column has that name.")).toBeInTheDocument();
});

test("add_column_opens_new_editor", async () => {
  const backend = await renderBoard({ replies: edits });
  openEditor("Today");
  fireEvent.change(field(), { target: { value: "Focus" } });
  fireEvent.click(inEditor("Add column after"));
  await settle();
  expect(argsOf(backend.calls, "board_column_edit")).toEqual([
    { lane: "today", name: "Focus", limit: 3 },
  ]);
  expect(argsOf(backend.calls, "board_column_add")).toEqual([{ after: "today" }]);
  // The board answers with the new column; its editor is open with the name selected.
  await emitBoardChanged(
    1,
    withCustom(boardOf(TASKS), [{ lane: "c_new00001", name: "New column" }]),
  );
  expect(field()).toHaveValue("New column");
  expect(field()).toHaveFocus();
});

test("add_column_dimmed_at_cap", async () => {
  const backend = await renderBoard({ board: withCustom(boardOf(TASKS), FOUR), replies: edits });
  openEditor("Today");
  const add = inEditor("Add column after");
  expect(add).toHaveAttribute("aria-disabled", "true");
  expect(within(editor()).getByText("Up to 4 extra columns.")).toBeInTheDocument();
  fireEvent.click(add);
  await settle();
  expect(argsOf(backend.calls, "board_column_add")).toEqual([]);
});

test("add_column_refused_says_why", async () => {
  await renderBoard({
    replies: {
      ...edits,
      board_column_add: () => {
        throw "tooManyColumns";
      },
    },
  });
  openEditor("Today");
  fireEvent.click(inEditor("Add column after"));
  await settle();
  expect(screen.getAllByText("Up to 4 extra columns.").length).toBeGreaterThan(0);
});

test("remove_dimmed_while_tasks", async () => {
  const board = withCustom(boardOf(TASKS), [
    { lane: "c_later", name: "Later", tasks: [boardTask("l1", "Plan trip", "c_later")] },
  ]);
  const backend = await renderBoard({ board, replies: edits });
  openEditor("Later");
  expect(inEditor("Remove column")).toHaveAttribute("aria-disabled", "true");
  expect(within(editor()).getByText("Move its tasks out first.")).toBeInTheDocument();
  fireEvent.click(inEditor("Remove column"));
  await settle();
  expect(argsOf(backend.calls, "board_column_remove")).toEqual([]);
});

test("remove_empty_column_toasts_and_focuses", async () => {
  const backend = await renderBoard({ board: withCustom(boardOf(TASKS), LATER), replies: edits });
  openEditor("Later");
  fireEvent.click(inEditor("Remove column"));
  await settle();
  expect(argsOf(backend.calls, "board_column_remove")).toEqual([{ lane: "c_later" }]);
  expect(screen.getByText("Removed Later.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
  expect(screen.queryByRole("group", { name: "Edit column" })).toBeNull();
  expect(nameButton("Doing")).toHaveFocus();
});

test("add_task_quiet_while_editing", async () => {
  await renderBoard({ replies: edits });
  const add = () => screen.getByRole("button", { name: "Add task" });
  expect(add().className).not.toBe("");
  const before = add().className;
  openEditor("Today");
  expect(add().className).not.toBe(before);
});

test("page_keys_ignored_in_editor", async () => {
  await renderBoard({ replies: edits });
  openEditor("Today");
  const stop = fireEvent.keyDown(field(), { key: "ArrowRight" });
  expect(stop).toBe(true);
  expect(field()).toHaveFocus();
  fireEvent.keyDown(inEditor("Save"), { key: "ArrowLeft" });
  expect(inEditor("Save")).toBeInTheDocument();
});

test("editor_closes_when_column_removed_elsewhere", async () => {
  await renderBoard({ board: withCustom(boardOf(TASKS), LATER), replies: edits });
  openEditor("Later");
  await emitBoardChanged(1, boardOf(TASKS));
  expect(screen.queryByRole("group", { name: "Edit column" })).toBeNull();
  expect(screen.getByText("That column is gone. Pick another.")).toBeInTheDocument();
});
