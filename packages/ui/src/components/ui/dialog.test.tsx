import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { expect, test, vi } from "vitest";
import { Dialog } from "./dialog";

const base = { title: "Delete all tracking data?", confirmLabel: "Delete", onConfirm: () => {} };

test("dialog_exposes_dialog_with_name_and_description", () => {
  render(<Dialog {...base} description="This cannot be undone." onCancel={() => {}} />);
  const dialog = screen.getByRole("dialog", { name: "Delete all tracking data?" });
  expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
  expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
});

test("dialog_renders_nothing_when_closed", () => {
  render(<Dialog {...base} open={false} onCancel={() => {}} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("dialog_cancel_label_defaults_and_overrides", () => {
  const { rerender } = render(<Dialog {...base} onCancel={() => {}} />);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  rerender(<Dialog {...base} cancelLabel="Stay focused" onCancel={() => {}} />);
  expect(screen.getByRole("button", { name: "Stay focused" })).toBeTruthy();
});

test("dialog_cancel_button_takes_initial_focus", async () => {
  render(<Dialog {...base} onCancel={() => {}} />);
  const cancel = screen.getByRole("button", { name: "Cancel" });
  await vi.waitFor(() => expect(document.activeElement).toBe(cancel));
});

test("dialog_escape_calls_cancel_only", () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<Dialog {...base} onCancel={onCancel} onConfirm={onConfirm} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test("dialog_backdrop_click_never_dismisses", () => {
  const onCancel = vi.fn();
  render(<Dialog {...base} destructive onCancel={onCancel} />);
  const overlay = document.querySelector("[data-slot=dialog-overlay]") as HTMLElement;
  expect(overlay).toBeTruthy();
  fireEvent.pointerDown(overlay);
  fireEvent.click(overlay);
  expect(onCancel).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { hidden: true })).toBeTruthy();
});

test("dialog_confirm_and_cancel_buttons_call_their_handlers", () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<Dialog {...base} onCancel={onCancel} onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("dialog_renders_destructive_as_alertdialog_with_critical_confirm_and_scrim", () => {
  render(<Dialog {...base} destructive onCancel={() => {}} />);
  const dialog = screen.getByRole("alertdialog", { name: "Delete all tracking data?" });
  expect(dialog).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete" }).getAttribute("data-variant")).toBe(
    "critical",
  );
  expect(document.querySelector("[data-slot=dialog-overlay]")?.getAttribute("data-scrim")).toBe(
    "true",
  );
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
});

test("dialog_renders_plain_confirm_as_primary_with_clear_backdrop", () => {
  render(<Dialog {...base} onCancel={() => {}} />);
  expect(screen.getByRole("button", { name: "Delete" }).getAttribute("data-variant")).toBe(
    "primary",
  );
  expect(document.querySelector("[data-slot=dialog-overlay]")?.getAttribute("data-scrim")).toBe(
    "false",
  );
});

test("dialog_scrim_alone_adds_the_scrim", () => {
  render(<Dialog {...base} scrim onCancel={() => {}} />);
  expect(document.querySelector("[data-slot=dialog-overlay]")?.getAttribute("data-scrim")).toBe(
    "true",
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
});

test("dialog_renders_loading_with_busy_confirm_and_stays_open", () => {
  const onConfirm = vi.fn();
  render(<Dialog {...base} loading onConfirm={onConfirm} onCancel={() => {}} />);
  const confirm = screen.getByRole("button", { name: "Delete" });
  expect(confirm.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(confirm);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
});

test("dialog_renders_children_between_description_and_actions", () => {
  render(
    <Dialog {...base} onCancel={() => {}}>
      <p>Extra detail</p>
    </Dialog>,
  );
  expect(within(screen.getByRole("dialog")).getByText("Extra detail")).toBeTruthy();
});

test("dialog_makes_the_background_inert", () => {
  render(
    <>
      <button type="button">Behind</button>
      <Dialog {...base} onCancel={() => {}} />
    </>,
  );
  expect(screen.queryByRole("button", { name: "Behind" })).toBeNull();
  expect(screen.getByRole("button", { name: "Behind", hidden: true })).toBeTruthy();
});

function WithTrigger(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog {...base} open={open} onCancel={() => setOpen(false)} />
    </>
  );
}

test("dialog_returns_focus_to_the_trigger_on_close", async () => {
  render(<WithTrigger />);
  const trigger = screen.getByRole("button", { name: "Open" });
  trigger.focus();
  fireEvent.click(trigger);
  await vi.waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
