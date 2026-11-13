import { KEYBOARD } from "@shared/test/fixtures";
import { expect, test } from "vitest";
import { shortcutItems } from "./shortcutItems";

test("each_action_is_listed_once_from_the_registry", () => {
  const labels = shortcutItems(KEYBOARD, true).map((item) => item.action);
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels).toEqual(expect.arrayContaining(["Start focus", "Just 2 minutes", "End session"]));
  expect(labels).not.toContain("Copy");
  expect(labels).not.toContain("Quit Orasenda");
  expect(labels.filter((label) => label === "Settings")).toHaveLength(1);
});

test("the_page_keys_fold_into_one_range_row", () => {
  const row = shortcutItems(KEYBOARD, true).find((item) => item.action === "Go to a page");
  expect(row?.keys).toBe("⌘1–6");
});

test("a_key_comes_from_fixed_not_from_code", () => {
  const fixed = KEYBOARD.fixed.map((f) =>
    f.keys === "Super+Enter" ? { ...f, display: "Q9", spoken: "Q nine" } : f,
  );
  const row = shortcutItems({ ...KEYBOARD, fixed }, true).find((i) => i.action === "Start focus");
  expect(row).toMatchObject({ keys: "Q9", spokenKeys: "Q nine" });
});
