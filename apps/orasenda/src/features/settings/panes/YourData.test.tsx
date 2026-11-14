import { argsOf, mockBackend, OVERVIEW, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, test } from "vitest";
import { YourData } from "./YourData";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

const COUNTS = { sessions: 0, presets: 0, notes: 0, settings: 0 };
const fail =
  (kind: string, message = "x") =>
  () =>
    Promise.reject({ kind, message });

async function open(replies = {}, running = false) {
  const ref = createRef<HTMLHeadingElement>();
  const backend = mockBackend(replies);
  const view = render(<YourData headingRef={ref} running={running} />);
  await settle();
  return { backend, ref, ...view };
}

const button = (name: string) => screen.getByRole("button", { name });
const lines = () => screen.getAllByRole("status").map((node) => node.textContent);

test("your_data_rows_render_counts", async () => {
  const { ref, container } = await open();
  const heading = screen.getByRole("heading", { level: 2, name: "Your data" });
  expect(ref.current).toBe(heading);
  expect(heading).toHaveAttribute("tabindex", "-1");
  expect(screen.getByText("12 sessions · 3 presets · 2 notes")).toBeInTheDocument();
  expect(screen.getByText(OVERVIEW.folder)).toBeInTheDocument();
  for (const label of ["Stored", "Data folder", "Move data", "Start over"]) {
    expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
  }
  const variants = [...container.querySelectorAll("button")].map((b) => [
    b.textContent,
    b.getAttribute("data-variant"),
  ]);
  expect(variants).toEqual([
    ["Show in Finder", "quiet"],
    ["Export data…", "quiet"],
    ["Import data…", "quiet"],
    ["Delete all data…", "ghost"],
  ]);
  const last = [...container.querySelectorAll('[data-slot="settings-row"]')].at(-1);
  expect(last).toContainElement(button("Delete all data…"));
});

test("counts_are_singular_and_skip_nothing", async () => {
  await open({
    data_overview: () => ({ ...OVERVIEW, counts: { ...COUNTS, sessions: 1, notes: 1 } }),
  });
  expect(screen.getByText("1 session · 0 presets · 1 note")).toBeInTheDocument();
});

test("show_in_finder_calls_the_command_and_reports_failure", async () => {
  const { backend } = await open({ data_show_folder: fail("write") });
  fireEvent.click(button("Show in Finder"));
  await settle();
  expect(argsOf(backend.calls, "data_show_folder")).toHaveLength(1);
  expect(lines()).toEqual(["Orasenda couldn't open the folder."]);
});

test("export_saved_line", async () => {
  const { backend } = await open({
    data_export: () => ({ kind: "saved", file: "Orasenda data 2026-11-12.db" }),
  });
  button("Export data…").focus();
  fireEvent.click(button("Export data…"));
  await settle();
  expect(argsOf(backend.calls, "data_export")).toHaveLength(1);
  expect(lines()).toEqual(["Saved Orasenda data 2026-11-12.db."]);
  expect(button("Export data…")).toHaveFocus();
});

test("cancelled_panel_says_nothing", async () => {
  await open();
  fireEvent.click(button("Export data…"));
  await settle();
  fireEvent.click(button("Import data…"));
  await settle();
  expect(screen.queryAllByRole("status")).toEqual([]);
});

test("import_report_line_non_zero_parts", async () => {
  const report = {
    added: { sessions: 12, presets: 1, notes: 3, settings: 0 },
    updated: { ...COUNTS, settings: 2 },
  };
  await open({ data_import: () => ({ kind: "imported", report }) });
  button("Import data…").focus();
  fireEvent.click(button("Import data…"));
  await settle();
  expect(lines()).toEqual(["Added 12 sessions, 1 preset and 3 notes. Updated 2 settings."]);
  expect(button("Import data…")).toHaveFocus();
});

test("import_refreshes_the_stored_counts", async () => {
  const report = { added: { ...COUNTS, sessions: 2 }, updated: COUNTS };
  let reads = 0;
  await open({
    data_overview: () => {
      reads += 1;
      return { ...OVERVIEW, counts: { ...COUNTS, sessions: reads === 1 ? 12 : 14 } };
    },
    data_import: () => ({ kind: "imported", report }),
  });
  expect(screen.getByText("12 sessions · 0 presets · 0 notes")).toBeInTheDocument();
  fireEvent.click(button("Import data…"));
  await settle();
  expect(reads).toBe(2);
  expect(screen.getByText("14 sessions · 0 presets · 0 notes")).toBeInTheDocument();
});

test("import_nothing_new_line", async () => {
  const report = { added: COUNTS, updated: COUNTS };
  await open({ data_import: () => ({ kind: "imported", report }) });
  fireEvent.click(button("Import data…"));
  await settle();
  expect(lines()).toEqual(["Nothing new in this file."]);
});

test("import_newer_line", async () => {
  await open({ data_import: fail("newer") });
  fireEvent.click(button("Import data…"));
  await settle();
  expect(lines()).toEqual([
    "This file was saved by a newer Orasenda. Update Orasenda to import it.",
  ]);
});

test.each([
  ["notOrasenda", "This file isn't Orasenda data."],
  ["unreadable", "Orasenda couldn't read this file."],
  ["write", "Orasenda couldn't write the file. Check there is space and try again."],
])("import_%s_line", async (kind, text) => {
  await open({ data_import: fail(kind) });
  fireEvent.click(button("Import data…"));
  await settle();
  expect(lines()).toEqual([text]);
});

test("busy_line", async () => {
  await open({ data_import: fail("busy") });
  button("Import data…").focus();
  fireEvent.click(button("Import data…"));
  await settle();
  expect(lines()).toEqual(["End the session first."]);
  expect(button("Import data…")).toHaveFocus();
});

test("a_second_press_while_working_is_ignored", async () => {
  let calls = 0;
  await open({
    data_export: () => {
      calls += 1;
      return new Promise(() => {});
    },
  });
  fireEvent.click(button("Export data…"));
  fireEvent.click(button("Exporting…"));
  await settle();
  expect(calls).toBe(1);
  expect(button("Exporting…")).toHaveAttribute("aria-busy", "true");
});

test("delete_all_dialog_copy_and_focus", async () => {
  const { backend, container } = await open();
  const trigger = button("Delete all data…");
  trigger.focus();
  fireEvent.click(trigger);
  await settle();
  const dialog = screen.getByRole("alertdialog", { name: "Delete all your Orasenda data?" });
  expect(
    within(dialog).getByText(
      "Your sessions, presets, notes and settings on this Mac are removed and Orasenda restarts fresh. Backups are not touched. To keep a copy, choose Back up now first.",
    ),
  ).toBeInTheDocument();
  const confirm = within(dialog).getByRole("button", { name: "Delete all data" });
  expect(confirm).toHaveAttribute("data-variant", "critical");
  expect(container.querySelectorAll('[data-variant="critical"]')).toHaveLength(0);
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());
  fireEvent.keyDown(dialog, { key: "Escape" });
  await settle();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(argsOf(backend.calls, "data_delete_all")).toHaveLength(0);
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.click(trigger);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Delete all data" }));
  await settle();
  expect(argsOf(backend.calls, "data_delete_all")).toHaveLength(1);
});

test("delete_all_failure_closes_the_dialog_and_says_why", async () => {
  await open({ data_delete_all: fail("busy") });
  fireEvent.click(button("Delete all data…"));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Delete all data" }));
  await settle();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(lines()).toEqual(["End the session first."]);
});

test("delete_all_while_a_session_runs_never_opens_the_dialog", async () => {
  await open({}, true);
  fireEvent.click(button("Delete all data…"));
  await settle();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(lines()).toEqual(["End the session first."]);
});

test("unavailable_store_disables_move_data", async () => {
  await open({ data_overview: () => ({ ...OVERVIEW, counts: null, store: "unavailable" }) });
  expect(screen.getByText("Unavailable until Orasenda can open its data.")).toBeInTheDocument();
  expect(button("Export data…")).toBeDisabled();
  expect(button("Import data…")).toBeDisabled();
  expect(button("Show in Finder")).toBeEnabled();
  expect(button("Delete all data…")).toBeEnabled();
  expect(screen.getByText(/Export and import need Orasenda's data/)).toBeInTheDocument();
});

test("newer_store_reads_like_unavailable", async () => {
  await open({ data_overview: () => ({ ...OVERVIEW, counts: null, store: "newer" }) });
  expect(screen.getByText("Unavailable until Orasenda can open its data.")).toBeInTheDocument();
  expect(button("Export data…")).toBeDisabled();
});

test("overview_failure_reads_kindly", async () => {
  await open({ data_overview: () => Promise.reject(new Error("boom")) });
  expect(screen.getByText("Orasenda couldn't read its data folder.")).toBeInTheDocument();
  expect(button("Export data…")).toBeDisabled();
  expect(screen.getByText(/Export and import need Orasenda's data/)).toBeInTheDocument();
  expect(button("Try again")).toBeEnabled();
});
