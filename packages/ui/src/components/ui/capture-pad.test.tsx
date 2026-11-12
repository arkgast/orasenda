import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { expect, test, vi } from "vitest";
import { CapturePad, type CapturePadProps, type InterruptionKind } from "./capture-pad";

function Host(
  props: Partial<CapturePadProps> & { initial?: string; initialKind?: InterruptionKind },
): ReactElement {
  const { initial = "", initialKind = "internal", ...rest } = props;
  const [value, setValue] = useState(initial);
  const [kind, setKind] = useState<InterruptionKind>(initialKind);
  return (
    <CapturePad
      value={value}
      kind={kind}
      onChange={setValue}
      onKindChange={setKind}
      onSave={() => {}}
      onClose={() => {}}
      {...rest}
    />
  );
}

test("capture_pad_exposes_dialog_with_name_and_description", () => {
  render(<Host />);
  const dialog = screen.getByRole("dialog", { name: "Capture a thought" });
  expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
  expect(dialog).toHaveAccessibleDescription("Leave it here and go back to what you were doing.");
});

test("capture_pad_renders_nothing_when_closed", () => {
  render(<Host open={false} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("capture_pad_exposes_thought_field_with_helper_and_focus", async () => {
  render(<Host />);
  const field = screen.getByRole("textbox", { name: "Thought" });
  expect(field).toHaveAccessibleDescription("Esc saves to Inbox and closes. ⌘\u21a9 saves too.");
  await waitFor(() => expect(document.activeElement).toBe(field));
});

test("capture_pad_exposes_kind_group_with_words", () => {
  render(<Host initialKind="external" />);
  const group = screen.getByRole("group", { name: "Interruption source" });
  expect(group).toBeTruthy();
  expect((screen.getByRole("radio", { name: "External" }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("radio", { name: "Internal" }) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/came from around you/i)).toBeTruthy();
});

test("capture_pad_kind_change_calls_back_and_updates_the_line", () => {
  render(<Host />);
  expect(screen.getByText(/came from your own mind/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "External" }));
  expect(screen.getByText(/came from around you/i)).toBeTruthy();
});

test("capture_pad_save_is_disabled_for_whitespace", () => {
  render(<Host initial="   " />);
  expect(
    (screen.getByRole("button", { name: "Save to Inbox" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("capture_pad_save_sends_trimmed_text_and_closes", async () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<Host initial="  buy milk  " initialKind="external" onSave={onSave} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Save to Inbox" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(onSave).toHaveBeenCalledWith({ text: "buy milk", kind: "external" });
});

test("capture_pad_escape_saves_text", async () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<Host initial="idea" onSave={onSave} onClose={onClose} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(onSave).toHaveBeenCalledWith({ text: "idea", kind: "internal" });
});

test("capture_pad_escape_on_empty_pad_closes_without_saving", () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<Host onSave={onSave} onClose={onClose} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
});

test("capture_pad_command_enter_saves", async () => {
  const onSave = vi.fn();
  render(<Host initial="idea" onSave={onSave} />);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Thought" }), {
    key: "Enter",
    metaKey: true,
  });
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
});

test("capture_pad_rejected_save_keeps_text_and_says_so", async () => {
  const onClose = vi.fn();
  render(<Host initial="idea" onSave={() => Promise.reject(new Error("no"))} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Save to Inbox" }));
  await screen.findByText("Your note is still here. Try saving again.");
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByRole("textbox", { name: "Thought" }) as HTMLTextAreaElement).value).toBe(
    "idea",
  );
});

test("capture_pad_suppresses_duplicate_saves_while_busy", async () => {
  let release: () => void = () => {};
  const onSave = vi.fn(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  render(<Host initial="idea" onSave={onSave} />);
  const save = screen.getByRole("button", { name: "Save to Inbox" });
  fireEvent.click(save);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  await act(async () => release());
});

const LIVE = '[role="status"], [role="alert"], [role="log"], [aria-live]';

test("capture_pad_adds_no_live_region_besides_error", async () => {
  const onClose = vi.fn();
  const view = render(<Host initial="idea" onClose={onClose} />);
  expect(document.querySelectorAll(LIVE)).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Save to Inbox" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  // The host announces "Saved to Inbox."; the pad leaves nothing behind that could.
  expect(screen.queryByText("Saved to Inbox.")).toBeNull();
  expect(document.querySelectorAll(LIVE)).toHaveLength(0);
  view.unmount();
  render(<Host initial="idea" onSave={() => Promise.reject(new Error("no"))} />);
  fireEvent.click(screen.getByRole("button", { name: "Save to Inbox" }));
  await screen.findByText("Your note is still here. Try saving again.");
  for (const live of Array.from(document.querySelectorAll(LIVE)))
    expect(live.closest("[data-slot=field-error]")).not.toBeNull();
});

test("capture_pad_redesign_copy", () => {
  render(<Host />);
  const dialog = screen.getByRole("dialog", { name: "Capture a thought" });
  expect(dialog).toHaveAccessibleDescription("Leave it here and go back to what you were doing.");
  expect(screen.getByRole("textbox", { name: "Thought" })).toHaveAccessibleDescription(
    "Esc saves to Inbox and closes. ⌘\u21a9 saves too.",
  );
  expect(screen.getByText("This came from your own mind.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "External" }));
  expect(screen.getByText("This came from around you.")).toBeTruthy();
});
