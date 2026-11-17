import type { WeeklyDay } from "@shared/ipc/bindings";

/** The review time's bounds in minutes after midnight: 04:00 to 23:59 (ruling G2). */
export const REVIEW_TIME = { min: 240, max: 1439, fallback: 1050 } as const;

export const DAY_LABEL: Record<WeeklyDay, string> = {
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
  mon: "Monday",
};

export const DAY_OPTIONS = (Object.keys(DAY_LABEL) as WeeklyDay[]).map((value) => ({
  value,
  label: DAY_LABEL[value],
}));

/** A stored time outside 04:00 to 23:59 reads as the default, 17:30. */
export function effectiveReviewTime(stored: number): number {
  return stored >= REVIEW_TIME.min && stored <= REVIEW_TIME.max ? stored : REVIEW_TIME.fallback;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Minutes after midnight as "HH:MM". */
export function timeText(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "HH:MM" as minutes, or null when it isn't a time of day inside 04:00 to 23:59. */
export function parseReviewTime(text: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 && minutes >= REVIEW_TIME.min && minutes <= REVIEW_TIME.max
    ? minutes
    : null;
}

/** "1 hour", "5 hours". */
export function goalText(hours: number): string {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
