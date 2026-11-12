import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { IntentField } from "./IntentField";

afterEach(cleanup);

function setup(value: string | null = null) {
  const onDone = vi.fn();
  render(<IntentField value={value} onDone={onDone} />);
  const field = screen.getByRole("textbox", { name: "What will be done?" });
  return { onDone, field };
}

test("intent_return_saves_blur_saves_escape_restores", () => {
  const a = setup("Draft");
  expect(a.field).toHaveValue("Draft");
  expect(a.field).toHaveAttribute("maxlength", "120");
  expect(a.field).toHaveFocus();
  fireEvent.change(a.field, { target: { value: "Finish the outline" } });
  fireEvent.keyDown(a.field, { key: "Enter" });
  expect(a.onDone).toHaveBeenCalledWith({ save: "Finish the outline", refocus: true });
  cleanup();

  const b = setup();
  fireEvent.change(b.field, { target: { value: "Reply to Sam" } });
  fireEvent.blur(b.field);
  // A blur means focus went elsewhere: it is not pulled back.
  expect(b.onDone).toHaveBeenCalledWith({ save: "Reply to Sam", refocus: false });
  cleanup();

  const c = setup("Saved text");
  fireEvent.change(c.field, { target: { value: "Typed over it" } });
  fireEvent.keyDown(c.field, { key: "Escape" });
  expect(c.onDone).toHaveBeenCalledWith({ save: undefined, refocus: true });
  fireEvent.blur(c.field);
  expect(c.onDone).toHaveBeenCalledTimes(1);
});

test("intent_empty_return_clears_and_unchanged_saves_nothing", () => {
  const a = setup("Draft");
  fireEvent.change(a.field, { target: { value: "   " } });
  fireEvent.keyDown(a.field, { key: "Enter" });
  expect(a.onDone).toHaveBeenCalledWith({ save: null, refocus: true });
  cleanup();

  const b = setup("Draft");
  fireEvent.blur(b.field);
  expect(b.onDone).toHaveBeenCalledWith({ save: undefined, refocus: false });
});
