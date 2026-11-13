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

test("recorder_none_for_empty_slot", () => {
  const { field } = setup({ keys: undefined });
  expect(field).toHaveAccessibleName(`${LABEL} None Change`);
  // Shown once for the eye (aria-hidden) and once in words for VoiceOver.
  const shown = screen.getAllByText("None").filter((n) => n.getAttribute("aria-hidden") === "true");
  expect(shown).toHaveLength(1);
});

test("recorder_empty_label_is_the_hosts", () => {
  const { field } = setup({ keys: undefined, emptyLabel: "Not set" });
  expect(field).toHaveAccessibleName(`${LABEL} Not set Change`);
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

const ADD_MODIFIER = "Add ⌘, ⌃ or ⌥. A single key can't be a shortcut.";

test("recorder_plain_f_says_add_modifier", () => {
  const { onRecord, field } = setup({ recording: true });
  expect(screen.queryByText(ADD_MODIFIER)).toBeNull();
  press(field, "KeyF");
  const message = screen.getByText(ADD_MODIFIER);
  expect(message).toHaveAttribute("aria-live", "polite");
  expect(field.getAttribute("aria-describedby")).toContain(message.id);
  expect(onRecord).not.toHaveBeenCalled();
  // Recording continues: a real chord still records, and the message goes.
  press(field, "KeyF", { ctrlKey: true, altKey: true });
  expect(onRecord).toHaveBeenCalledWith("⌃⌥F");
  expect(screen.queryByText(ADD_MODIFIER)).toBeNull();
});

test("recorder_message_line_exists_before_it_has_text", () => {
  const { field } = setup({ recording: true });
  const live = document.querySelector('[aria-live="polite"]');
  expect(live).not.toBeNull();
  expect(live?.textContent).toBe("");
  expect(field.getAttribute("aria-describedby")).toContain((live as HTMLElement).id);
});

test("recorder_reports_recording_changes", () => {
  const onRecordingChange = vi.fn();
  const { field } = setup({ onRecordingChange });
  fireEvent.click(field);
  expect(onRecordingChange).toHaveBeenLastCalledWith(true);
  press(field, "Escape");
  expect(onRecordingChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(field);
  press(field, "KeyK", { ctrlKey: true });
  expect(onRecordingChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(field);
  fireEvent.blur(field);
  expect(onRecordingChange).toHaveBeenLastCalledWith(false);
  expect(onRecordingChange.mock.calls.map(([on]) => on)).toEqual([
    true,
    false,
    true,
    false,
    true,
    false,
  ]);
});

function withWarning() {
  const onUseAnyway = vi.fn();
  const onPickAnother = vi.fn();
  const view = setup({ warning: { reason: "Other apps use this.", onUseAnyway, onPickAnother } });
  return { ...view, onUseAnyway, onPickAnother };
}

test("warning_pick_another_first", () => {
  const { onUseAnyway, onPickAnother } = withWarning();
  const buttons = screen.getAllByRole("button").map((b) => b.textContent);
  expect(buttons.indexOf("Pick another")).toBeLessThan(buttons.indexOf("Use anyway"));
  const pick = screen.getByRole("button", { name: "Pick another" });
  expect(pick).toHaveFocus();
  const line = screen.getByText("Other apps use this. Use it everywhere anyway?");
  expect(line.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  expect(pick).toHaveAccessibleDescription("Other apps use this. Use it everywhere anyway?");
  expect(screen.getByRole("button", { name: "Use anyway" })).toHaveAccessibleDescription(
    "Other apps use this. Use it everywhere anyway?",
  );
  fireEvent.click(screen.getByRole("button", { name: "Use anyway" }));
  expect(onUseAnyway).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: /Start or pause/ })).toHaveFocus();
  fireEvent.click(pick);
  expect(onPickAnother).toHaveBeenCalledTimes(1);
});

test("warning_is_described_by_the_field", () => {
  const { field } = withWarning();
  const text = screen.getByText("Other apps use this. Use it everywhere anyway?");
  expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(text.id);
});

test("app_only_slot_needs_command_or_control", () => {
  const { onRecord, field } = setup({ appOnly: true, recording: true });
  expect(screen.getByText(/needs Command or Control plus a key/)).toBeInTheDocument();
  press(field, "KeyU", { altKey: true });
  expect(onRecord).not.toHaveBeenCalled();
  expect(screen.getByText("Add ⌘ or ⌃. A single key can't be a shortcut.")).toBeInTheDocument();
  press(field, "KeyU", { metaKey: true });
  expect(onRecord).toHaveBeenCalledWith("⌘U");
});
