import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { describeShortcut } from "../../lib/shortcuts";
import { ShortcutRecorder, type ShortcutRecorderProps } from "./shortcut-recorder";

beforeAll(() => {
  (window as unknown as { Orasenda: { strictShortcuts: boolean } }).Orasenda = {
    strictShortcuts: true,
  } as never;
});
afterEach(() => vi.restoreAllMocks());

const LABEL = "Start or pause focus from anywhere";

function setup(over: Partial<ShortcutRecorderProps> = {}) {
  const onRecord = vi.fn();
  render(<ShortcutRecorder label={LABEL} keys="⌃⌥F" onRecord={onRecord} {...over} />);
  return { onRecord, field: screen.getByRole("button", { name: /Start or pause/ }) };
}

function press(el: HTMLElement, code: string, mods: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(el, { code, key: code, ...mods });
}

test("shortcut_recorder_records_canonical_glyphs", () => {
  const { onRecord, field } = setup({ recording: true });
  press(field, "KeyF", { metaKey: true, shiftKey: true, altKey: true, ctrlKey: true });
  expect(onRecord).toHaveBeenLastCalledWith("⌃⌥⇧⌘F");
  // Recording stopped: a second press is not captured.
  press(field, "KeyG", { metaKey: true });
  expect(onRecord).toHaveBeenCalledTimes(1);
});

test("shortcut_recorder_output_round_trips_describe_shortcut", () => {
  const codes = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `Key${c}`),
    ..."0123456789".split("").map((c) => `Digit${c}`),
    "Period",
    "Comma",
    "Enter",
    "Space",
    "Tab",
    "Backspace",
    "ArrowLeft",
    "ArrowUp",
    "ArrowRight",
    "ArrowDown",
  ];
  for (const code of codes) {
    const { onRecord, field } = setup({ recording: true });
    press(field, code, { metaKey: true });
    expect(onRecord).toHaveBeenCalledTimes(1);
    const glyphs = onRecord.mock.calls[0][0] as string;
    // Strict mode: an emitted string that is not in the key table would throw here.
    expect(() => describeShortcut(glyphs)).not.toThrow();
    expect(glyphs.startsWith("⌘")).toBe(true);
    document.body.innerHTML = "";
  }
});

test("shortcut_recorder_return_emits_the_return_glyph", () => {
  const { onRecord, field } = setup({ recording: true });
  press(field, "NumpadEnter", { ctrlKey: true });
  expect(onRecord).toHaveBeenCalledWith("⌃↩");
});

test("shortcut_recorder_esc_cancels", () => {
  const { onRecord, field } = setup();
  fireEvent.click(field);
  expect(field).toHaveAccessibleName(/Type the new keys, Esc cancels/);
  press(field, "Escape");
  expect(onRecord).not.toHaveBeenCalled();
  expect(field).toHaveAccessibleName(/Change/);
  press(field, "KeyF", { metaKey: true });
  expect(onRecord).not.toHaveBeenCalled();
});

test("shortcut_recorder_backspace_turns_off", () => {
  const { onRecord, field } = setup({ recording: true });
  press(field, "Backspace");
  expect(onRecord).toHaveBeenCalledWith(null);
});

test("shortcut_recorder_modifier_only_press_records_nothing", () => {
  const { onRecord, field } = setup({ recording: true });
  for (const code of ["MetaLeft", "ControlRight", "AltLeft", "ShiftRight"])
    press(field, code, { metaKey: true });
  expect(onRecord).not.toHaveBeenCalled();
  // Still recording afterwards.
  press(field, "KeyK", { ctrlKey: true });
  expect(onRecord).toHaveBeenCalledWith("⌃K");
});

test("shortcut_recorder_needs_a_modifier_plus_a_key", () => {
  const { onRecord, field } = setup({ recording: true });
  press(field, "KeyF");
  press(field, "KeyF", { shiftKey: true });
  expect(onRecord).not.toHaveBeenCalled();
});

test("shortcut_recorder_return_and_space_start_recording", () => {
  const { field } = setup();
  press(field, "Enter");
  expect(field).toHaveAccessibleName(/Type the new keys/);
  press(field, "Escape");
  press(field, "Space");
  expect(field).toHaveAccessibleName(/Type the new keys/);
});

test("shortcut_recorder_restore_default", () => {
  const onRestoreDefault = vi.fn();
  setup({ onRestoreDefault });
  fireEvent.click(screen.getByRole("button", { name: "Restore default" }));
  expect(onRestoreDefault).toHaveBeenCalledTimes(1);
});

test("shortcut_recorder_name_composed_with_labelledby", () => {
  const { field } = setup();
  expect(field).not.toHaveAttribute("aria-label");
  expect(field).not.toHaveAttribute("aria-invalid");
  expect(field.getAttribute("aria-labelledby")?.split(" ")).toHaveLength(3);
  expect(field).toHaveAccessibleName(`${LABEL} Control-Option-F Change`);
  const keys = screen.getByText("⌃⌥F");
  expect(keys).toHaveAttribute("aria-hidden", "true");
});

test("shortcut_recorder_spoken_keys_override_and_off_state", () => {
  const { field } = setup({ keys: undefined });
  expect(field).toHaveAccessibleName(`${LABEL} Off Change`);
});

test("shortcut_recorder_id_settable", () => {
  const { field } = setup({ id: "kbd-focus" });
  expect(field.id).toBe("kbd-focus");
  expect(field.getAttribute("aria-labelledby")).toContain("kbd-focus");
});

test("shortcut_recorder_conflict_is_described_not_live", () => {
  const line = "Orasenda uses ⌘K for Commands. Pick a different one.";
  const { field } = setup({ conflict: line });
  expect(field).toHaveAccessibleDescription(expect.stringContaining(line));
  const el = screen.getByText(line);
  expect(el.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
  expect(field).not.toHaveAttribute("aria-invalid");
  expect(field).toHaveAttribute("data-conflict", "true");
});

test("shortcut_recorder_shift_tab_leaves_the_field", () => {
  const { onRecord, field } = setup({ recording: true });
  const event = createEvent.keyDown(field, { code: "Tab", key: "Tab", shiftKey: true });
  fireEvent(field, event);
  expect(event.defaultPrevented).toBe(false);
  expect(onRecord).not.toHaveBeenCalled();
});
