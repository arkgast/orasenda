import type { BackupEntry, BackupKind, DataOverview_Serialize } from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { backend } from "./backend";

const KINDS: BackupKind[] = ["auto", "manual", "beforeImport", "beforeRestore"];
const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 3, 9, 12);

/** Twelve backups, one of each kind in turn, the last from a newer Orasenda. */
const TWELVE: BackupEntry[] = Array.from({ length: 12 }, (_, i) => ({
  file: `orasenda-${i}.db`,
  kind: KINDS[i % KINDS.length],
  createdMs: START + i * 30 * DAY,
  bytes: 40_960 + i * 4096,
  newer: i === 11,
}));

const overview = (backups: BackupEntry[]): DataOverview_Serialize => ({
  counts: { sessions: 12, presets: 3, notes: 2, settings: 9 },
  folder: "/Users/test/Library/Application Support/com.veloud.orasenda",
  backups,
  policy: { frequency: "monthly", keep: 12 },
  totalBytes: backups.reduce((sum, b) => sum + b.bytes, 0),
  store: "ok",
});

const data = (backups: BackupEntry[]) => ({ data_overview: () => overview(backups) });

export const BACKUPS_SCENARIOS: Record<string, Handler> = {
  // Settings › Backups: no backups yet, and twelve (one from a newer Orasenda).
  backupsEmpty: backend({ replies: data([]) }),
  backupsTwelve: backend({ replies: data(TWELVE) }),
  // The store cannot be opened: the list and its actions stay, the rest is off.
  backupsUnavailable: backend({
    replies: { data_overview: () => ({ ...overview(TWELVE), store: "unavailable", counts: null }) },
  }),
};
