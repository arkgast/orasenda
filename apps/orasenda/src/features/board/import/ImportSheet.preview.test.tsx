import { argsOf, deferred, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { item, picked, previewOf, renderImport, row, THREE } from "./ImportSheet.support";
import { resetImportAsk } from "./importAsk";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  resetImportAsk();
});

const open = async (replies = {}) => {
  const backend = await renderImport(replies);
  fireEvent.click(row("Apple Reminders"));
  await settle();
  return backend;
};
const confirm = (name: RegExp | string) => screen.getByRole("button", { name });

test("cap_line_shown", async () => {
  await open({
    import_preview: () =>
      picked(previewOf("reminders", THREE, { summary: ["Showing 500 of 812. Import these."] })),
  });
  expect(screen.getByText("Showing 500 of 812. Import these.")).toBeInTheDocument();
});

test("import_disabled_with_reason", async () => {
  await open();
  expect(confirm("Import 3 tasks")).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Select none" }));
  expect(confirm(/^Import/)).toBeDisabled();
  expect(screen.getByText("Select at least one task to import.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Call the bank" }));
  expect(confirm("Import 1 task")).toBeEnabled();
});

test("import_sends_selected_keys_and_shows_line_with_undo", async () => {
  const backend = await open({ task_import: () => ({ importId: 3, count: 2 }) });
  fireEvent.click(screen.getByRole("checkbox", { name: "Call the bank" }));
  fireEvent.click(confirm("Import 2 tasks"));
  await settle();
  expect(argsOf(backend.calls, "task_import")).toEqual([{ previewId: 7, keys: [0, 2] }]);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Imported 2 tasks to Backlog.")).toBeInTheDocument();
});

test("import_line_with_undo", async () => {
  await open({ task_import: () => ({ importId: 3, count: 3 }) });
  fireEvent.click(confirm("Import 3 tasks"));
  await settle();
  expect(screen.getByText("Imported 3 tasks to Backlog.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Undo importing 3 tasks" })).toBeInTheDocument();
});

test("importing_label_while_writing", async () => {
  const slow = deferred<unknown>();
  await open({ task_import: () => slow.promise });
  fireEvent.click(confirm("Import 3 tasks"));
  await settle();
  expect(confirm("Importing…")).toBeDisabled();
  slow.resolve({ importId: 3, count: 3 });
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("undo_answers_import_undone", async () => {
  const backend = await open();
  fireEvent.click(confirm("Import 3 tasks"));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Undo importing 3 tasks" }));
  await settle();
  expect(argsOf(backend.calls, "task_import_undo")).toEqual([{ importId: 3 }]);
  expect(screen.getByText("Import undone.")).toBeInTheDocument();
});

test("stale_import_keeps_sheet", async () => {
  await open({
    task_import: () => {
      throw { kind: "stale", message: "x" };
    },
  });
  fireEvent.click(confirm("Import 3 tasks"));
  await settle();
  expect(
    screen.getByText("That preview is out of date. Choose the source again."),
  ).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("failed_import_try_again_keeps_preview", async () => {
  let calls = 0;
  const backend = await open({
    task_import: () => {
      calls += 1;
      if (calls === 1) throw { kind: "store", message: "That didn't save. Try again." };
      return { importId: 3, count: 3 };
    },
  });
  fireEvent.click(confirm("Import 3 tasks"));
  await settle();
  expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Renew passport" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await settle();
  expect(argsOf(backend.calls, "task_import")).toHaveLength(2);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("preview_marks_unselected_rows", async () => {
  await open({
    import_preview: () =>
      picked(previewOf("reminders", [item(0, "A"), item(1, "B", { selected: false })])),
  });
  expect(screen.getByRole("checkbox", { name: "A" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "B" })).not.toBeChecked();
});
