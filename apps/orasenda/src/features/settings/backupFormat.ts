import type { BackupKind, DataError, DataErrorKind } from "@shared/ipc/bindings";

const DATE_PARTS = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "3 November 2026, 09:12" in the Mac's local time zone. */
export function formatBackupTime(ms: number): string {
  const parts = Object.fromEntries(
    DATE_PARTS.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

const ONE_DECIMAL = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const UNITS = ["KB", "MB", "GB"] as const;

/** "41 KB", "4.1 MB": 1 KB is 1000 bytes, as Finder shows. */
export function formatBytes(n: number): string {
  if (n < 1000) return `${ONE_DECIMAL.format(n)} B`;
  let value = n;
  let unit = 0;
  do {
    value /= 1000;
    unit += 1;
  } while (value >= 999.95 && unit < UNITS.length);
  return `${ONE_DECIMAL.format(value)} ${UNITS[unit - 1]}`;
}

/** The kind as a word, so it is never shown by a mark alone. */
export function kindWord(kind: BackupKind): string {
  switch (kind) {
    case "auto":
      return "Automatic";
    case "manual":
      return "Manual";
    case "beforeImport":
      return "Before import";
    case "beforeRestore":
      return "Before restore";
  }
}

/** "12 backups · 4.1 MB". */
export function backupSummary(count: number, bytes: number): string {
  return `${count} ${count === 1 ? "backup" : "backups"} · ${formatBytes(bytes)}`;
}

const GENERIC = "Orasenda couldn't do that. Try again.";

function isDataError(failure: unknown): failure is DataError {
  return (
    typeof failure === "object" &&
    failure !== null &&
    typeof (failure as { kind?: unknown }).kind === "string"
  );
}

/** The status line for a failed backup command (spec G). */
export function backupFailure(failure: unknown): string {
  if (!isDataError(failure)) return GENERIC;
  const kind: DataErrorKind = failure.kind;
  switch (kind) {
    case "busy":
      return "End the session first.";
    case "newer":
      return "This backup was saved by a newer Orasenda.";
    case "notOrasenda":
      return "This file isn't Orasenda data.";
    case "unreadable":
      return "Orasenda couldn't read this file.";
    case "write":
      return "Orasenda couldn't write the file. Check there is space and try again.";
    case "notFound":
      return "Orasenda couldn't find that backup.";
    case "unavailable":
      return "Orasenda can't open its data right now.";
  }
}
