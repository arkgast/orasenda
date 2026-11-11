import type { Os } from "../../ipc/bindings";

const OS_LABELS: Readonly<Record<Exclude<Os, "other">, string>> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
};

/** Display name for an OS family; `other` and values this UI doesn't know show as sent. */
export function osLabel(os: Os): string {
  return Object.hasOwn(OS_LABELS, os) ? OS_LABELS[os as keyof typeof OS_LABELS] : os;
}

/**
 * Spike only (`spike/DevPanel.tsx`): the app's own clock and finish times arrive formatted by Rust.
 *
 * Hours and minutes of `epochMs` (seconds are reserved for countdowns). Locale and time zone
 * default to the system's; the hour cycle comes from the locale, so midnight is never `24:00`.
 * Builds a new formatter on each call so a time-zone change shows on the next tick.
 */
export function formatClock(epochMs: number, locale?: string, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone === undefined ? {} : { timeZone }),
  });
  return formatter.format(epochMs);
}
