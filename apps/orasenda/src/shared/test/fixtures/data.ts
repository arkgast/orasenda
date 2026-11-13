import { act } from "@testing-library/react";
import type { BackupEntry, DataOverview_Serialize } from "../../ipc/bindings";
import { events } from "../../ipc/bindings";
import type { Replies } from "./index";

/** One backup of every kind, the last one saved by a newer Orasenda (`data_overview`). */
export const OVERVIEW: DataOverview_Serialize = {
  counts: { sessions: 12, presets: 3, notes: 2, settings: 9 },
  folder: "/Users/test/Library/Application Support/com.veloud.orasenda",
  backups: [
    {
      file: "orasenda-auto-20261101T080000Z.db",
      kind: "auto",
      createdMs: 1_793_606_400_000,
      bytes: 40_960,
      newer: false,
    },
    {
      file: "orasenda-manual-20261105T090000Z.db",
      kind: "manual",
      createdMs: 1_793_955_600_000,
      bytes: 40_960,
      newer: false,
    },
    {
      file: "orasenda-before-import-20261106T090000Z.db",
      kind: "beforeImport",
      createdMs: 1_794_042_000_000,
      bytes: 40_960,
      newer: false,
    },
    {
      file: "orasenda-before-restore-20261107T090000Z.db",
      kind: "beforeRestore",
      createdMs: 1_794_128_400_000,
      bytes: 40_960,
      newer: false,
    },
    {
      file: "orasenda-manual-20261108T090000Z.db",
      kind: "manual",
      createdMs: 1_794_214_800_000,
      bytes: 45_056,
      newer: true,
    },
  ],
  policy: { frequency: "monthly", keep: 10 },
  totalBytes: 208_896,
  store: "ok",
};

export async function emitBackupsChanged(overview: DataOverview_Serialize): Promise<void> {
  await act(async () => {
    await events.backupsChanged.emit(overview);
  });
}

/** The data and backup commands' default replies, spread into the mocked backend. */
export const DATA_REPLIES: Replies = {
  data_overview: () => OVERVIEW,
  data_show_folder: () => null,
  data_delete_all: () => null,
  backups_create: (): BackupEntry => OVERVIEW.backups[0],
  backups_delete: () => null,
  backups_restore: () => null,
  backups_set_policy: (args) => (args as { policy: unknown }).policy,
  data_export: () => ({ kind: "cancelled" }),
  data_import: () => ({ kind: "cancelled" }),
};
