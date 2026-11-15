import { argsOf, boardOf, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { card, renderBoard, TASKS } from "../BoardPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

const withTask = (over = {}) => boardOf(TASKS.map((t) => (t.id === "t1" ? { ...t, ...over } : t)));

async function openSheet(options: Parameters<typeof renderBoard>[0] = {}) {
  const backend = await renderBoard({ replies: { task_update: () => null }, ...options });
  card("Write intro").focus();
  fireEvent.keyDown(card("Write intro"), { key: "Enter" });
  await settle();
  // Guard: confirm focus is inside the sheet before the test goes on.
  await waitFor(() =>
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true),
  );
  return backend;
}

const patches = (backend: Awaited<ReturnType<typeof openSheet>>) =>
  argsOf(backend.calls, "task_update");

test("detail_opens_and_returns_focus", async () => {
  await openSheet();
  const dialog = screen.getByRole("dialog", { name: "Write intro" });
  expect(dialog).toHaveAttribute("data-size", "sheet");
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  // Focus returns to the card on a timer after the sheet unmounts.
  await waitFor(() => expect(card("Write intro")).toHaveFocus());
});

test("Close and Done both close the sheet", async () => {
  await openSheet();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.keyDown(card("Write intro"), { key: "Enter" });
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("edits_save_on_change", async () => {
  const backend = await openSheet();
  const dialog = within(screen.getByRole("dialog"));
  // Discrete fields save at once.
  fireEvent.keyDown(dialog.getByRole("spinbutton", { name: "Estimate" }), { key: "ArrowUp" });
  fireEvent.change(dialog.getByRole("combobox", { name: "Priority" }), {
    target: { value: "high" },
  });
  fireEvent.click(dialog.getByRole("radio", { name: "Shallow" }));
  fireEvent.change(dialog.getByLabelText("Due"), { target: { value: "2026-11-20" } });
  await settle();
  expect(patches(backend)).toEqual([
    { id: "t1", patch: { estimate: 3 } },
    { id: "t1", patch: { priority: "high" } },
    { id: "t1", patch: { kind: "shallow" } },
    { id: "t1", patch: { due: "2026-11-20" } },
  ]);
  // A text field saves when it loses focus.
  fireEvent.change(dialog.getByRole("textbox", { name: "Title" }), {
    target: { value: "  Write the intro  " },
  });
  fireEvent.blur(dialog.getByRole("textbox", { name: "Title" }));
  await settle();
  expect(patches(backend).at(-1)).toEqual({ id: "t1", patch: { title: "Write the intro" } });
  // Clearing the date clears it.
  fireEvent.change(dialog.getByLabelText("Due"), { target: { value: "" } });
  await settle();
  expect(patches(backend).at(-1)).toEqual({ id: "t1", patch: { due: null } });
});

test("the column select moves the task", async () => {
  const backend = await openSheet({ replies: { task_update: () => null, task_move: () => null } });
  fireEvent.change(screen.getByRole("combobox", { name: "Column" }), {
    target: { value: "doing" },
  });
  await settle();
  expect(argsOf(backend.calls, "task_move")).toEqual([{ id: "t1", lane: "doing", index: 1 }]);
});

test("an empty title is refused and not saved", async () => {
  const backend = await openSheet();
  const title = screen.getByRole("textbox", { name: "Title" });
  fireEvent.change(title, { target: { value: "   " } });
  fireEvent.blur(title);
  await settle();
  expect(patches(backend)).toEqual([]);
  expect(screen.getByText("A task needs a title. Still using Write intro.")).toBeInTheDocument();
  expect(screen.getByText("The title wasn't saved.")).toBeInTheDocument();
  expect(title).toHaveAttribute("aria-invalid", "true");
});

test("a failed save keeps the value and says so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSheet({
    replies: {
      task_update: () => {
        throw new Error("store");
      },
    },
  });
  const notes = screen.getByRole("textbox", { name: "Notes" });
  fireEvent.change(notes, { target: { value: "Start with the ending" } });
  fireEvent.blur(notes);
  await settle();
  expect(notes).toHaveValue("Start with the ending");
  expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
});

test("the Frog toggle keeps an earlier field's failure line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSheet({
    replies: {
      task_update: () => {
        throw new Error("store");
      },
    },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), {
    target: { value: "high" },
  });
  await settle();
  expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Today's Frog" }));
  await settle();
  expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
});

test("the record line reads estimate, buffer and actual", async () => {
  await openSheet({
    board: withTask({ estimate: 3, planned: 4, sessions: 4, tracked: "1h 40m" }),
  });
  expect(screen.getByText("Estimate 3 · 4 with buffer · Actual 4 sessions, 1h 40m")).toBeVisible();
});

test("the record line says No estimate", async () => {
  await openSheet({ board: withTask({ estimate: null, planned: null }) });
  expect(screen.getByText(/^No estimate · Actual 0 sessions, 0h 00m$/)).toBeVisible();
});

test("the Frog cannot be set on a Done task", async () => {
  const backend = await renderBoard({ replies: { task_update: () => null } });
  fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
  await settle();
  card("Ship release").focus();
  fireEvent.keyDown(card("Ship release"), { key: "Enter" });
  await settle();
  fireEvent.click(screen.getByRole("checkbox", { name: "Today's Frog" }));
  await settle();
  expect(screen.getByText("A finished task can't be the Frog.")).toBeInTheDocument();
  expect(argsOf(backend.calls, "task_set_frog")).toEqual([]);
});

test("breakdown_prompt_over_four", async () => {
  await openSheet({ board: withTask({ estimate: 5, planned: 7 }) });
  expect(screen.getByText("This looks big. Could it be a few smaller tasks?")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add a checklist" }));
  expect(screen.getByRole("textbox", { name: "Add an item" })).toHaveFocus();
});

test("no breakdown prompt at four or fewer", async () => {
  await openSheet({ board: withTask({ estimate: 4, planned: 5 }) });
  expect(screen.queryByText(/This looks big/)).toBeNull();
});

test("keep_as_is_dismisses_for_good", async () => {
  const backend = await openSheet({ board: withTask({ estimate: 5, planned: 7 }) });
  fireEvent.click(screen.getByRole("button", { name: "Keep as is" }));
  await settle();
  expect(patches(backend)).toEqual([{ id: "t1", patch: { breakdownDismissed: true } }]);
  expect(screen.queryByText(/This looks big/)).toBeNull();
  // Dismissed on the task: it stays away after a reopen.
  cleanup();
  await openSheet({ board: withTask({ estimate: 5, planned: 7, breakdownDismissed: true }) });
  expect(screen.queryByText(/This looks big/)).toBeNull();
});

const ITEM = { id: "c1", text: "Outline", done: false };

test("Add a checklist focuses the add field when items already exist", async () => {
  await openSheet({ board: withTask({ estimate: 5, planned: 7, checklist: [ITEM] }) });
  fireEvent.click(screen.getByRole("button", { name: "Add a checklist" }));
  expect(screen.getByRole("textbox", { name: "Add an item" })).toHaveFocus();
});

test("Keep as is hands focus to the estimate", async () => {
  await openSheet({ board: withTask({ estimate: 5, planned: 7 }) });
  fireEvent.click(screen.getByRole("button", { name: "Keep as is" }));
  await settle();
  expect(screen.getByRole("spinbutton", { name: "Estimate" })).toHaveFocus();
});

test("a Frog that moves says so, with Undo, inside the sheet", async () => {
  const backend = await openSheet({
    replies: { task_update: () => null, task_set_frog: () => "t2" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Today's Frog" }));
  await settle();
  expect(
    within(screen.getByRole("dialog")).getByText("Frog moved to Write intro."),
  ).toBeInTheDocument();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Undo moving the Frog" }),
  );
  await settle();
  expect(argsOf(backend.calls, "task_set_frog").at(-1)).toEqual({ id: "t2", on: true });
});

test("a failure stays on screen when another field then saves", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let calls = 0;
  const backend = await openSheet({
    replies: {
      task_update: () => {
        calls += 1;
        if (calls === 1) throw new Error("store");
        return null;
      },
    },
  });
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByRole("combobox", { name: "Priority" }), {
    target: { value: "high" },
  });
  await settle();
  expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("radio", { name: "Shallow" }));
  await settle();
  expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
  // Try again sends both the failed priority and nothing newer to clear it.
  fireEvent.click(screen.getByRole("button", { name: "Try again saving" }));
  await settle();
  expect(patches(backend).at(-1)).toEqual({ id: "t1", patch: { priority: "high" } });
  expect(screen.queryByText("That didn't save. Try again.")).toBeNull();
});

test("notes save after a pause, and tags and checklist items save at once", async () => {
  const backend = await openSheet();
  const dialog = within(screen.getByRole("dialog"));
  // No shouldAdvanceTime: under load, real time would leak into the 800 ms pause and fire the save early.
  vi.useFakeTimers();
  try {
    fireEvent.change(dialog.getByRole("textbox", { name: "Notes" }), { target: { value: "Hi" } });
    await vi.advanceTimersByTimeAsync(799);
    expect(patches(backend)).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
  } finally {
    vi.useRealTimers();
  }
  await settle();
  expect(patches(backend)).toEqual([{ id: "t1", patch: { notes: "Hi" } }]);
  const tag = dialog.getByRole("textbox", { name: "Tags" });
  fireEvent.change(tag, { target: { value: "writing" } });
  fireEvent.keyDown(tag, { key: "Enter" });
  const item = dialog.getByRole("textbox", { name: "Add an item" });
  fireEvent.change(item, { target: { value: "Outline" } });
  fireEvent.keyDown(item, { key: "Enter" });
  await settle();
  const sent = patches(backend).slice(1) as { patch: Record<string, unknown> }[];
  expect(sent[0]?.patch).toEqual({ tags: ["writing"] });
  expect(sent[1]?.patch).toMatchObject({ checklist: [{ text: "Outline", done: false }] });
});
