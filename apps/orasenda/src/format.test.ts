import { expect, test } from "vitest";
import type { AppInfo, Os } from "./bindings";
import { formatClock, infoLine, osLabel } from "./format";

test("os_label_maps_known_values", () => {
  expect(osLabel("macos")).toBe("macOS");
  expect(osLabel("windows")).toBe("Windows");
  expect(osLabel("linux")).toBe("Linux");
  expect(osLabel("ios")).toBe("iOS");
  expect(osLabel("android")).toBe("Android");
});

test("os_label_unknown_shows_raw_value", () => {
  expect(osLabel("other")).toBe("other");
  // A value from a newer core that this UI does not know yet.
  expect(osLabel("freebsd" as Os)).toBe("freebsd");
});

test("info_line_joins_version_os_and_arch", () => {
  const info: AppInfo = { name: "Orasenda", version: "0.1.0", os: "macos", arch: "aarch64" };
  expect(infoLine(info)).toBe("0.1.0 · macOS aarch64");
});

test("format_clock_midnight_utc", () => {
  const midnight = Date.UTC(2026, 10, 8, 0, 0, 30);
  // 24-hour locale: midnight is 00:00, never 24:00.
  expect(formatClock(midnight, "en-GB", "UTC")).toBe("00:00");
  // 12-hour locale: the hour cycle comes from the locale.
  expect(formatClock(midnight, "en-US", "UTC")).toMatch(/^12:00\s?AM$/);
});

test("format_clock_shows_hours_and_minutes_only", () => {
  expect(formatClock(Date.UTC(2026, 10, 8, 14, 32, 59), "en-GB", "UTC")).toBe("14:32");
});
