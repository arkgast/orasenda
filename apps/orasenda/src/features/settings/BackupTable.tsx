import { DataTable, Dialog } from "@orasenda/ui";
import type { BackupEntry, StoreStatus } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { useEffect, useRef, useState } from "react";
import {
  backupFailure,
  backupSummary,
  formatBackupTime,
  formatBytes,
  kindWord,
} from "./backupFormat";

type Props = {
  entries: BackupEntry[];
  /** A session is running: Restore refuses with a line and opens no Dialog. */
  sessionRunning?: boolean;
  /** The store's state: when it is not `ok`, the Restore Dialog says the current data is not backed up. */
  store?: StoreStatus;
  /** A line for the pane's status (a finished delete, a refusal). */
  onStatus?: (line: string) => void;
};

type Asking = { what: "restore" | "delete"; entry: BackupEntry };

const UNREADABLE =
  "Orasenda can't open your current data, so it can't back it up first. This backup replaces it and Orasenda restarts.";
const RESTORE_BODY =
  "Orasenda backs up your current data, replaces it with this backup and restarts.";
const NEWER = "From a newer Orasenda";

/** The backups as a ruled table with Restore and Delete per row, and the Dialogs they open. */
export function BackupTable({ entries, sessionRunning = false, store = "ok", onStatus }: Props) {
  const [asking, setAsking] = useState<Asking | null>(null);
  const [working, setWorking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Where focus goes once a deleted row is gone from the list.
  const afterDelete = useRef<{ file: string; index: number } | null>(null);

  useEffect(() => {
    const gone = afterDelete.current;
    if (!gone || asking || entries.some((entry) => entry.file === gone.file)) return;
    afterDelete.current = null;
    const buttons = box.current?.querySelectorAll<HTMLButtonElement>(
      'button[aria-label^="Delete the backup"]',
    );
    const target = buttons?.length
      ? buttons[Math.min(gone.index, buttons.length - 1)]
      : document.getElementById("settings-backups-heading");
    target?.focus();
  }, [entries, asking]);

  const confirm = async () => {
    if (!asking) return;
    setWorking(true);
    const { what, entry } = asking;
    try {
      const result =
        what === "restore"
          ? await commands.backupsRestore(entry.file)
          : await commands.backupsDelete(entry.file);
      if (result.status === "error") onStatus?.(backupFailure(result.error));
      else if (what === "delete") {
        afterDelete.current = {
          file: entry.file,
          index: entries.findIndex((e) => e.file === entry.file),
        };
        onStatus?.("Backup deleted.");
      }
      // A restore restarts Orasenda; nothing more to show.
    } catch (failure) {
      console.error(`backups_${what} failed`, failure);
      onStatus?.(backupFailure(failure));
    }
    setWorking(false);
    setAsking(null);
  };

  const when = asking ? formatBackupTime(asking.entry.createdMs) : "";
  return (
    <div ref={box} className="mt-6">
      <DataTable
        caption="Backups"
        rows={entries}
        rowKey={(entry) => entry.file}
        columns={[
          {
            key: "date",
            header: "Date",
            cell: (e) => (
              <>
                <span className="block">{formatBackupTime(e.createdMs)}</span>
                <span className="block text-ink-muted">{kindWord(e.kind)}</span>
              </>
            ),
          },
          { key: "size", header: "Size", numeric: true, cell: (e) => formatBytes(e.bytes) },
        ]}
        actions={(entry) => {
          const time = formatBackupTime(entry.createdMs);
          return [
            {
              label: `Restore the backup from ${time}`,
              icon: "restore",
              disabled: entry.newer,
              reason: entry.newer ? NEWER : undefined,
              onSelect: () =>
                sessionRunning
                  ? onStatus?.(backupFailure({ kind: "busy", message: "" }))
                  : setAsking({ what: "restore", entry }),
            },
            {
              label: `Delete the backup from ${time}`,
              icon: "delete",
              onSelect: () => setAsking({ what: "delete", entry }),
            },
          ];
        }}
        footer={
          entries.length > 0
            ? backupSummary(
                entries.length,
                entries.reduce((sum, entry) => sum + entry.bytes, 0),
              )
            : undefined
        }
        empty={
          <p className="app-muted">
            No backups yet. The first one is made automatically, or choose Back up now.
          </p>
        }
      />
      {asking?.what === "restore" ? (
        <Dialog
          title={`Restore the backup from ${when}?`}
          description={store === "ok" ? RESTORE_BODY : UNREADABLE}
          confirmLabel="Restore and restart"
          loading={working}
          onCancel={() => setAsking(null)}
          onConfirm={confirm}
        />
      ) : null}
      {asking?.what === "delete" ? (
        <Dialog
          destructive
          title={`Delete the backup from ${when}?`}
          description="The file is removed from this Mac. Your current data is not touched."
          confirmLabel="Delete backup"
          loading={working}
          onCancel={() => setAsking(null)}
          onConfirm={confirm}
        />
      ) : null}
    </div>
  );
}
