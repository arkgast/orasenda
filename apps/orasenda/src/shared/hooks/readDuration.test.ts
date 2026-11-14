import { afterEach, expect, test } from "vitest";
import { readDuration } from "./readDuration";

afterEach(() => document.documentElement.style.setProperty("--duration-hint", "4s"));

test("reads_seconds_and_milliseconds", () => {
  expect(readDuration("--duration-hint")).toBe(4000);
  document.documentElement.style.setProperty("--duration-hint", "1600ms");
  expect(readDuration("--duration-hint")).toBe(1600);
});

test("a_missing_token_is_a_bug", () => {
  expect(() => readDuration("--duration-nope")).toThrow(/not a duration/);
});
