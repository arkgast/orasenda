import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactElement, useRef, useState } from "react";
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
  expect(screen.getByRole("alertdialog")).toBeTruthy();
});

test("dialog_plain_and_scrim_backdrop_clicks_never_dismiss", () => {
  for (const scrim of [false, true]) {
    const onCancel = vi.fn();
    const { unmount } = render(<Dialog {...base} scrim={scrim} onCancel={onCancel} />);
    const overlay = document.querySelector("[data-slot=dialog-overlay]") as HTMLElement;
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    unmount();
  }
});

test("dialog_has_aria_modal", () => {
  render(<Dialog {...base} onCancel={() => {}} />);
  expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
});

test("dialog_ignores_a_stale_press_when_returning_focus", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    document.body.insertAdjacentHTML("beforeend", '<button id="old-press">Old</button>');
    const old = document.getElementById("old-press") as HTMLElement;
    fireEvent.pointerDown(old);
    vi.setSystemTime(Date.now() + 5000);
    const { rerender } = render(<Dialog {...base} open={false} onCancel={() => {}} />);
    rerender(<Dialog {...base} open onCancel={() => {}} />);
    await vi.waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    rerender(<Dialog {...base} open={false} onCancel={() => {}} />);
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).not.toBe(old);
    old.remove();
  } finally {
    vi.useRealTimers();
  }
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

test("dialog_sheet_is_capped_at_the_sheet_width_with_the_scrim", () => {
  render(
    <Dialog {...base} size="sheet" confirmLabel="Done" onCancel={() => {}}>
      <p>Fields</p>
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("data-size", "sheet");
  expect(dialog.className).toContain("max-w-sheet-width");
  expect(dialog.className).not.toContain("max-w-panel-width");
  expect(document.querySelector("[data-slot=dialog-overlay]")).toHaveAttribute(
    "data-scrim",
    "true",
  );
});

test("dialog_sheet_body_is_two_columns_that_stack_when_narrow", () => {
  render(
    <Dialog {...base} size="sheet" onCancel={() => {}}>
      <p>Fields</p>
    </Dialog>,
  );
  const body = document.querySelector("[data-slot=dialog-sheet-body]") as HTMLElement;
  expect(body).toHaveClass("@container");
  expect(body.firstElementChild?.className).toContain("grid-cols-1");
  expect(body.firstElementChild?.className).toContain("@sheet-stack:grid-cols-2");
});

test("dialog_sheet_pins_the_actions_and_scrolls_only_the_body", () => {
  render(
    <Dialog {...base} size="sheet" onCancel={() => {}}>
      <p>Fields</p>
    </Dialog>,
  );
  const panel = document.querySelector("[data-slot=dialog-content]") as HTMLElement;
  const body = document.querySelector("[data-slot=dialog-sheet-body]") as HTMLElement;
  expect(panel).toHaveClass("overflow-hidden");
  expect(panel).not.toHaveClass("overflow-auto");
  expect(body).toHaveClass("overflow-auto", "min-h-0", "flex-1");
});

test("dialog_default_size_keeps_the_panel_width_and_a_clear_backdrop", () => {
  render(<Dialog {...base} onCancel={() => {}} />);
  expect(screen.getByRole("dialog").className).toContain("max-w-panel-width");
  expect(document.querySelector("[data-slot=dialog-sheet-body]")).toBeNull();
  expect(document.querySelector("[data-slot=dialog-overlay]")).toHaveAttribute(
    "data-scrim",
    "false",
  );
});

function FocusHost() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Dialog {...base} size="sheet" initialFocusRef={ref} onCancel={() => {}}>
      <input ref={ref} aria-label="Title" />
    </Dialog>
  );
}

test("dialog_initial_focus_ref_takes_focus_instead_of_cancel", async () => {
  render(<FocusHost />);
  await vi.waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
});

test("dialog_without_confirm", () => {
  render(<Dialog title="Import tasks" onCancel={() => {}} />);
  const actions = document.querySelector("[data-slot=dialog-actions]") as HTMLElement;
  expect(within(actions).getAllByRole("button")).toHaveLength(1);
  expect(within(actions).getByRole("button", { name: "Cancel" })).toBeTruthy();
});

test("dialog_confirm_disabled_reason", () => {
  const onConfirm = vi.fn();
  render(
    <Dialog
      title="Import tasks"
      confirmLabel="Import 0 tasks"
      confirmDisabledReason="Select at least one task to import."
      onCancel={() => {}}
      onConfirm={onConfirm}
    />,
  );
  const confirm = screen.getByRole("button", { name: "Import 0 tasks" });
  expect(confirm).toBeDisabled();
  expect(confirm).toHaveAccessibleDescription("Select at least one task to import.");
  expect(screen.getByText("Select at least one task to import.")).toBeVisible();
  fireEvent.click(confirm);
  expect(onConfirm).not.toHaveBeenCalled();
});

function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: top,
  } as DOMRect;
}

function NudgeHost() {
  return (
    <Dialog {...base} size="sheet" onCancel={() => {}}>
      <button type="button">Remove item</button>
      <label>
        Next
        <input aria-label="Next" />
      </label>
    </Dialog>
  );
}

function nudgeSetup() {
  render(<NudgeHost />);
  const body = document.querySelector("[data-slot=dialog-sheet-body]") as HTMLElement;
  const next = screen.getByLabelText("Next");
  vi.spyOn(body, "getBoundingClientRect").mockReturnValue(rect(0, 100));
  vi.spyOn(next, "getBoundingClientRect").mockReturnValue(rect(110, 130));
  body.scrollTop = 0;
  return { body, next };
}

test("dialog_sheet_nudges_when_a_pointerdown_elsewhere_left_focus_to_code", () => {
  const { body, next } = nudgeSetup();
  // WebKit does not focus the pressed button; the code then moves focus to another field.
  fireEvent.pointerDown(screen.getByRole("button", { name: "Remove item" }));
  next.focus();
  expect(body.scrollTop).toBeGreaterThan(0);
});

test("dialog_sheet_leaves_pointer_focus_alone_when_the_focused_element_holds_the_press", () => {
  const { body, next } = nudgeSetup();
  fireEvent.pointerDown(next);
  next.focus();
  expect(body.scrollTop).toBe(0);
});

function frames() {
  const queue: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => queue.push(cb));
  return () => {
    for (const cb of queue.splice(0)) cb(0);
  };
}

test("dialog_sheet_pointerup_ends_the_press_a_frame_later", () => {
  const run = frames();
  const { body, next } = nudgeSetup();
  fireEvent.pointerDown(next);
  fireEvent.pointerUp(next);
  run();
  next.blur();
  next.focus();
  expect(body.scrollTop).toBeGreaterThan(0);
});

test("dialog_sheet_next_frame_clears_the_press", () => {
  const run = frames();
  const { body, next } = nudgeSetup();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Remove item" }));
  run();
  next.focus();
  expect(body.scrollTop).toBeGreaterThan(0);
});

test("dialog_sheet_clicking_a_label_leaves_its_control_alone", () => {
  frames();
  const { body, next } = nudgeSetup();
  const label = next.closest("label") as HTMLElement;
  fireEvent.pointerDown(label);
  fireEvent.pointerUp(label);
  next.focus();
  expect(body.scrollTop).toBe(0);
});

// jsdom has no layout, so the fields would count as hidden.
function showFields() {
  for (const el of document.querySelectorAll("input, textarea"))
    vi.spyOn(el, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
}

function WrapHost() {
  return (
    <Dialog
      title="Task"
      size="sheet"
      confirmLabel="Done"
      cancelLabel="Close"
      onConfirm={() => {}}
      onCancel={() => {}}
    >
      <label>
        Title
        <input type="text" />
      </label>
      <label>
        Notes
        <textarea />
      </label>
    </Dialog>
  );
}

test("dialog_sheet_plain_tab_leaves_focus_alone_when_it_moved_on_its_own", () => {
  const run = frames();
  render(<WrapHost />);
  showFields();
  const notes = screen.getByRole("textbox", { name: "Notes" });
  const close = screen.getByRole("button", { name: "Close" });
  notes.focus();
  fireEvent.keyDown(notes, { key: "Tab" });
  close.focus();
  run();
  expect(document.activeElement).toBe(close);
});

test("dialog_sheet_plain_tab_wraps_when_focus_is_stuck", () => {
  const run = frames();
  render(<WrapHost />);
  showFields();
  const notes = screen.getByRole("textbox", { name: "Notes" });
  notes.focus();
  fireEvent.keyDown(notes, { key: "Tab" });
  run();
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Title" }));
});

test("dialog_sheet_plain_tab_ignores_a_handled_tab", () => {
  const run = frames();
  render(<WrapHost />);
  showFields();
  const notes = screen.getByRole("textbox", { name: "Notes" });
  notes.addEventListener("keydown", (e) => e.preventDefault());
  notes.focus();
  fireEvent.keyDown(notes, { key: "Tab" });
  run();
  expect(document.activeElement).toBe(notes);
});

test("dialog_sheet_shift_tab_wraps_to_notes_unless_full_keyboard_access_is_on", () => {
  frames();
  render(<WrapHost />);
  showFields();
  const title = screen.getByRole("textbox", { name: "Title" });
  title.focus();
  fireEvent.keyDown(title, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Notes" }));
});
