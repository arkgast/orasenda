import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ColumnEditor, type ColumnEditorProps } from "./column-editor";

function setup(over: Partial<ColumnEditorProps> = {}) {
  const fns = { onSave: vi.fn(), onCancel: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn() };
  const props: ColumnEditorProps = {
    name: "Review",
    limit: null,
    taken: ["Backlog", "Today"],
    canAdd: true,
    canRemove: true,
    ...fns,
    ...over,
  };
  const view = render(
    <div>
      <ColumnEditor {...props} />
      <button type="button">outside</button>
    </div>,
  );
  return { ...fns, view, field: screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement };
}

const stepperLimit = { value: 2, min: 0, max: 9, zeroLabel: "No limit" };

test("editor_focuses_name_selected", () => {
  const { field } = setup();
  expect(field).toHaveFocus();
  expect(field.selectionStart).toBe(0);
  expect(field.selectionEnd).toBe("Review".length);
  expect(document.querySelector("[data-slot=column-editor]")).not.toBeNull();
});

test("editor_enter_saves_trimmed", () => {
  const { field, onSave } = setup({ limit: stepperLimit });
  fireEvent.change(field, { target: { value: "  Waiting  " } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onSave).toHaveBeenCalledExactlyOnceWith({ name: "Waiting", limit: 2 });
});

test("editor_enter_in_the_stepper_saves", () => {
  const { onSave } = setup({ limit: stepperLimit });
  fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Enter" });
  expect(onSave).toHaveBeenCalledExactlyOnceWith({ name: "Review", limit: 2 });
});

test("editor_escape_cancels", () => {
  const { field, onCancel, onSave } = setup();
  fireEvent.keyDown(field, { key: "Escape" });
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
});

test("editor_blur_saves_valid_cancels_invalid", () => {
  const a = setup();
  fireEvent.change(a.field, { target: { value: "Waiting" } });
  fireEvent.blur(a.field, { relatedTarget: screen.getByText("outside") });
  expect(a.onSave).toHaveBeenCalledExactlyOnceWith({ name: "Waiting", limit: null });
  expect(a.onCancel).not.toHaveBeenCalled();
  a.view.unmount();
  const b = setup();
  fireEvent.change(b.field, { target: { value: "  " } });
  fireEvent.blur(b.field, { relatedTarget: null });
  expect(b.onCancel).toHaveBeenCalledTimes(1);
  expect(b.onSave).not.toHaveBeenCalled();
});

test("editor_blur_inside_the_editor_does_nothing", () => {
  const { field, onSave, onCancel } = setup();
  fireEvent.blur(field, { relatedTarget: screen.getByRole("button", { name: "Save" }) });
  expect(onSave).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});

test("editor_duplicate_name_inline_error", () => {
  const { field, onSave } = setup();
  fireEvent.change(field, { target: { value: " today " } });
  expect(screen.getByText(/another column/i)).toBeInTheDocument();
  expect(field).toHaveAttribute("aria-invalid", "true");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onSave).not.toHaveBeenCalled();
});

test("editor_length_errors_block_save", () => {
  const { field, onSave } = setup();
  fireEvent.change(field, { target: { value: "x".repeat(25) } });
  expect(screen.getByText(/1 to 24/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).not.toHaveBeenCalled();
});

test("editor_shows_a_given_error_until_the_name_changes", () => {
  const { field } = setup({ error: "That name is in use." });
  expect(screen.getByText("That name is in use.")).toBeInTheDocument();
  fireEvent.change(field, { target: { value: "Waiting" } });
  expect(screen.queryByText("That name is in use.")).toBeNull();
});

test("editor_no_limit_saves_null", () => {
  const { field, onSave } = setup({ limit: { ...stepperLimit, value: 1 } });
  fireEvent.click(screen.getByRole("button", { name: "Decrease Limit" }));
  expect(screen.getByRole("spinbutton")).toHaveTextContent("No limit");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onSave).toHaveBeenCalledExactlyOnceWith({ name: "Review", limit: null });
});

test("editor_hides_the_stepper_without_a_limit", () => {
  setup();
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

test("editor_dimmed_buttons_describe_reason", () => {
  const { onAdd, onRemove } = setup({
    canAdd: { reason: "Up to 4 extra columns." },
    canRemove: { reason: "Move its tasks out first." },
  });
  const add = screen.getByRole("button", { name: "Add column after" });
  const remove = screen.getByRole("button", { name: "Remove column" });
  for (const [button, reason] of [
    [add, "Up to 4 extra columns."],
    [remove, "Move its tasks out first."],
  ] as const) {
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
    const id = button.getAttribute("aria-describedby") as string;
    expect(document.getElementById(id)).toHaveTextContent(reason);
    fireEvent.click(button);
  }
  expect(onAdd).not.toHaveBeenCalled();
  expect(onRemove).not.toHaveBeenCalled();
});

test("editor_enabled_buttons_call_their_handlers", () => {
  const { onAdd, onRemove } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Add column after" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove column" }));
  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test("editor_hides_remove_when_null", () => {
  setup({ canRemove: null });
  expect(screen.queryByRole("button", { name: "Remove column" })).toBeNull();
  expect(screen.getByRole("button", { name: "Add column after" })).toBeInTheDocument();
});

test("editor_save_is_primary_and_cancel_quiet", () => {
  const { onCancel } = setup();
  expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("data-variant", "primary");
  const cancel = screen.getByRole("button", { name: "Cancel" });
  expect(cancel).toHaveAttribute("data-variant", "quiet");
  fireEvent.click(cancel);
  expect(onCancel).toHaveBeenCalledTimes(1);
});
