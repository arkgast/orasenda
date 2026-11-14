import { expect, test } from "vitest";
import { hintText } from "./keyHint";

const KEYS = { start: "⌘↩", end: "⌘." };

test("hint_names_space_while_single_keys_are_on", () => {
  const on = { singleKeys: true, ...KEYS };
  expect(hintText({ ...on, idle: true, paused: false })).toBe("Space starts · Esc leaves");
  expect(hintText({ ...on, idle: false, paused: false })).toBe("Space pauses · Esc leaves");
  expect(hintText({ ...on, idle: false, paused: true })).toBe("Space resumes · Esc leaves");
});

test("hint_names_the_registry_keys_when_single_keys_are_off", () => {
  const off = { singleKeys: false, paused: false, ...KEYS };
  expect(hintText({ ...off, idle: true })).toBe("⌘↩ starts · Esc leaves");
  expect(hintText({ ...off, idle: false })).toBe("⌘. ends · Esc leaves");
});

test("hint_never_guesses_a_key_the_registry_has_not_told_us", () => {
  const unknown = { singleKeys: false, paused: false, start: null, end: null };
  expect(hintText({ ...unknown, idle: true })).toBe("Esc leaves");
  expect(hintText({ ...unknown, idle: false })).toBe("Esc leaves");
});
