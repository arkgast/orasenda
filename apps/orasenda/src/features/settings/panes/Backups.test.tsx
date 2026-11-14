import { mockBackend, settle } from "@shared/test/fixtures";
import { emitBackupsChanged, OVERVIEW } from "@shared/test/fixtures/data";
import { RUNNING } from "@shared/test/fixtures/timer";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { formatBackupTime, formatBytes } from "../backupFormat";
import { Backups } from "./Backups";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const NOV3 = new Date(2026, 10, 3, 9, 12).getTime();
const calls = (backend: { calls: { cmd: string; args: unknown }[] }, cmd: string) =>
  backend.calls.filter((c) => c.cmd === cmd);

async function show(replies = {}) {
  const backend = mockBackend(replies);
  const ref = createRef<HTMLHeadingElement>();
  render(<Backups headingRef={ref} />);
  await settle();
  return { backend, ref };
}

test("backups_heading_keeps_the_ref", async () => {
  const { ref } = await show();
  const heading = screen.getByRole("heading", { level: 2, name: "Backups" });
  expect(ref.current).toBe(heading);
  expect(heading).toHaveAttribute("tabindex", "-1");
});

test("format_time_and_bytes", () => {
  expect(formatBackupTime(NOV3)).toBe("3 November 2026, 09:12");
  expect(formatBytes(40_960)).toBe("41 KB");
  expect(formatBytes(4_100_000)).toBe("4.1 MB");
  expect(formatBytes(208_896)).toBe("208.9 KB");
});

test("backups_policy_radios_save", async () => {
  const { backend } = await show();
  expect(screen.getByRole("radio", { name: "Every month" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Every 3 months" }));
  await settle();
  expect(calls(backend, "backups_set_policy")[0].args).toEqual({
    policy: { frequency: "quarterly", keep: 10 },
  });
  expect(screen.getByRole("radio", { name: "Every 3 months" })).toBeChecked();
});

test("copying_replies_end_the_save_after_one_call", async () => {
  const { backend } = await show({
    backups_set_policy: (args: unknown) => ({ ...(args as { policy: object }).policy }),
  });
  fireEvent.click(screen.getByRole("radio", { name: "Every 3 months" }));
  await settle();
  expect(calls(backend, "backups_set_policy")).toHaveLength(1);
  expect(screen.getByRole("radio", { name: "Every 3 months" })).toBeChecked();
});

test("keep_line_shows_in_the_keep_row", async () => {
  await show();
  const field = screen.getByRole("textbox", { name: /Newest backups to keep/ });
  fireEvent.change(field, { target: { value: "20" } });
  fireEvent.blur(field);
  await settle();
  const line = screen.getByText("Keeping the newest 20 backups.");
  expect(line).toHaveAttribute("role", "status");
  const back = screen.getByRole("button", { name: "Back up now" });
  expect(back.closest("[role=group], div")?.parentElement?.contains(line)).toBe(false);
});

test("keep_saves_a_value_in_range", async () => {
  const { backend } = await show();
  const field = screen.getByRole("textbox", { name: /Newest backups to keep/ });
  fireEvent.change(field, { target: { value: "20" } });
  fireEvent.blur(field);
  await settle();
  expect(calls(backend, "backups_set_policy")[0].args).toEqual({
    policy: { frequency: "monthly", keep: 20 },
  });
});

test("keep_range_error_line", async () => {
  const { backend } = await show();
  const field = screen.getByRole("textbox", { name: /Newest backups to keep/ });
  fireEvent.change(field, { target: { value: "51" } });
  fireEvent.blur(field);
  await settle();
  expect(screen.getByText("Between 1 and 50 backups. Still using 10.")).toBeInTheDocument();
  expect(calls(backend, "backups_set_policy")).toHaveLength(0);
});

test("last_backup_none_yet", async () => {
  await show({ data_overview: () => ({ ...OVERVIEW, backups: [], totalBytes: 0 }) });
  expect(screen.getByText("None yet")).toBeInTheDocument();
  expect(
    screen.getByText("No backups yet. The first one is made automatically, or choose Back up now."),
  ).toBeInTheDocument();
});

test("last_backup_shows_the_newest_and_back_up_now_runs", async () => {
  const { backend } = await show();
  expect(
    screen.getAllByText(formatBackupTime(OVERVIEW.backups[4].createdMs)).length,
  ).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole("button", { name: "Back up now" }));
  await settle();
  expect(calls(backend, "backups_create")).toHaveLength(1);
  expect(screen.getByText("Backed up.")).toBeInTheDocument();
});

test("backup_list_kind_words_and_sizes", async () => {
  await show();
  const table = screen.getByRole("table", { name: /backups/i });
  for (const word of ["Automatic", "Manual", "Before import", "Before restore"])
    expect(within(table).getAllByText(word).length).toBeGreaterThan(0);
  expect(within(table).getAllByText("41 KB")).toHaveLength(4);
  expect(within(table).getByText("45.1 KB")).toBeInTheDocument();
  expect(within(table).getByText("5 backups · 208.9 KB")).toBeInTheDocument();
});

test("backup_table_actions_named", async () => {
  await show();
  const when = formatBackupTime(OVERVIEW.backups[0].createdMs);
  expect(screen.getByRole("button", { name: `Restore the backup from ${when}` })).toBeEnabled();
  expect(screen.getByRole("button", { name: `Delete the backup from ${when}` })).toBeEnabled();
});

test("newer_backup_restore_disabled", async () => {
  await show();
  const when = formatBackupTime(OVERVIEW.backups[4].createdMs);
  expect(screen.getByText("From a newer Orasenda")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Restore the backup from ${when}` })).toBeDisabled();
  expect(screen.getByRole("button", { name: `Delete the backup from ${when}` })).toBeEnabled();
});

test("delete_backup_dialog_critical_confirm_only", async () => {
  const { backend } = await show();
  const when = formatBackupTime(OVERVIEW.backups[0].createdMs);
  fireEvent.click(screen.getByRole("button", { name: `Delete the backup from ${when}` }));
  const dialog = await screen.findByRole("alertdialog", {
    name: `Delete the backup from ${when}?`,
  });
  expect(
    within(dialog).getByText(
      "The file is removed from this Mac. Your current data is not touched.",
    ),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Cancel" })).not.toHaveAttribute(
    "data-variant",
    "critical",
  );
  const confirm = within(dialog).getByRole("button", { name: "Delete backup" });
  expect(confirm).toHaveAttribute("data-variant", "critical");
  fireEvent.click(confirm);
  await settle();
  expect(calls(backend, "backups_delete")[0].args).toEqual({ file: OVERVIEW.backups[0].file });
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("restore_dialog_normal_copy_and_restores", async () => {
  const { backend } = await show();
  const when = formatBackupTime(OVERVIEW.backups[0].createdMs);
  fireEvent.click(screen.getByRole("button", { name: `Restore the backup from ${when}` }));
  const dialog = await screen.findByRole("dialog", { name: `Restore the backup from ${when}?` });
  expect(
    within(dialog).getByText(
      "Orasenda backs up your current data, replaces it with this backup and restarts.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Restore and restart" }));
  await settle();
  expect(calls(backend, "backups_restore")[0].args).toEqual({ file: OVERVIEW.backups[0].file });
});

test("restore_dialog_unreadable_copy", async () => {
  await show({ data_overview: () => ({ ...OVERVIEW, store: "unavailable", counts: null }) });
  const when = formatBackupTime(OVERVIEW.backups[0].createdMs);
  fireEvent.click(screen.getByRole("button", { name: `Restore the backup from ${when}` }));
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText(
      "Orasenda can't open your current data, so it can't back it up first. This backup replaces it and Orasenda restarts.",
    ),
  ).toBeInTheDocument();
});

test("restore_failure_is_said", async () => {
  await show({ backups_restore: () => Promise.reject({ kind: "busy", message: "x" }) });
  const when = formatBackupTime(OVERVIEW.backups[0].createdMs);
  fireEvent.click(screen.getByRole("button", { name: `Restore the backup from ${when}` }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Restore and restart" }));
  await settle();
  expect(screen.getByText("End the session first.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("backups_changed_refreshes", async () => {
  await show();
  await emitBackupsChanged({
    ...OVERVIEW,
    backups: OVERVIEW.backups.slice(0, 1),
    totalBytes: 40_960,
  });
  expect(screen.getByText("1 backup · 41 KB")).toBeInTheDocument();
});

test("unavailable_store_keeps_list_actions", async () => {
  await show({ data_overview: () => ({ ...OVERVIEW, store: "unavailable", counts: null }) });
  const when = formatBackupTime(OVERVIEW.backups[0].createdMs);
  expect(screen.getByRole("button", { name: `Restore the backup from ${when}` })).toBeEnabled();
  expect(screen.getByRole("button", { name: `Delete the backup from ${when}` })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Back up now" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Every month" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: /Newest backups to keep/ })).toBeDisabled();
});

const gate = () => {
  let release: (value: unknown) => void = () => {};
  const held = new Promise((resolve) => {
    release = resolve;
  });
  return { held, release };
};
const restoreOf = (i: number) =>
  screen.getByRole("button", {
    name: `Restore the backup from ${formatBackupTime(OVERVIEW.backups[i].createdMs)}`,
  });
const deleteOf = (i: number) =>
  screen.getByRole("button", {
    name: `Delete the backup from ${formatBackupTime(OVERVIEW.backups[i].createdMs)}`,
  });

test("policy_saves_chain_and_the_last_carries_both_changes", async () => {
  const first = gate();
  let count = 0;
  const { backend } = await show({
    backups_set_policy: (args: unknown) => {
      const policy = (args as { policy: unknown }).policy;
      count += 1;
      return count === 1
        ? first.held.then(() => ({ ...(policy as object) }))
        : { ...(policy as object) };
    },
  });
  const field = screen.getByRole("textbox", { name: /Newest backups to keep/ });
  fireEvent.change(field, { target: { value: "20" } });
  fireEvent.blur(field);
  fireEvent.click(screen.getByRole("radio", { name: "Every 3 months" }));
  await settle();
  expect(calls(backend, "backups_set_policy")).toHaveLength(1);
  first.release(null);
  await settle();
  const sent = calls(backend, "backups_set_policy");
  expect(sent).toHaveLength(2);
  expect(sent[1].args).toEqual({ policy: { frequency: "quarterly", keep: 20 } });
  expect(screen.getByRole("radio", { name: "Every 3 months" })).toBeChecked();
});

test("delete_success_moves_focus_to_the_next_row", async () => {
  await show();
  fireEvent.click(deleteOf(0));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete backup" }));
  await settle();
  await emitBackupsChanged({
    ...OVERVIEW,
    backups: OVERVIEW.backups.slice(1),
    totalBytes: 1,
  });
  expect(document.activeElement).toBe(deleteOf(1));
});

test("cancel_returns_focus_to_the_trigger", async () => {
  await show();
  const trigger = deleteOf(0);
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});

test("restore_during_a_session_says_busy_and_opens_no_dialog", async () => {
  await show({ timer_view: () => RUNNING });
  fireEvent.click(restoreOf(0));
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("End the session first.")).toBeInTheDocument();
});

test("restore_confirm_is_loading_while_the_reply_is_held", async () => {
  const hold = gate();
  await show({ backups_restore: () => hold.held.then(() => null) });
  fireEvent.click(restoreOf(0));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Restore and restart" }));
  await settle();
  expect(within(dialog).getByRole("button", { name: /Restore and restart/ })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  hold.release(null);
  await settle();
});

test.each([
  ["newer", "This backup was saved by a newer Orasenda."],
  ["notOrasenda", "This file isn't Orasenda data."],
  ["unreadable", "Orasenda couldn't read this file."],
])("restore_failure_%s_line", async (kind, line) => {
  await show({ backups_restore: () => Promise.reject({ kind, message: "x" }) });
  fireEvent.click(restoreOf(0));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Restore and restart" }));
  await settle();
  expect(screen.getByText(line)).toBeInTheDocument();
});

test("back_up_now_write_failure_line", async () => {
  await show({ backups_create: () => Promise.reject({ kind: "write", message: "x" }) });
  fireEvent.click(screen.getByRole("button", { name: "Back up now" }));
  await settle();
  expect(
    screen.getByText("Orasenda couldn't write the file. Check there is space and try again."),
  ).toBeInTheDocument();
});

test("newer_store_keeps_list_actions_and_says_why_once", async () => {
  await show({ data_overview: () => ({ ...OVERVIEW, store: "newer", counts: null }) });
  expect(restoreOf(0)).toBeEnabled();
  expect(deleteOf(0)).toBeEnabled();
  expect(screen.getByRole("button", { name: "Back up now" })).toBeDisabled();
  expect(screen.getAllByText(/Orasenda can't open its data/)).toHaveLength(1);
});
