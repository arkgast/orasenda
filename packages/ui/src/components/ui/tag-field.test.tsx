import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TagField } from "./tag-field";

function setup(tags: string[] = ["Writing"], over: Partial<Parameters<typeof TagField>[0]> = {}) {
  const onChange = vi.fn();
  render(<TagField label="Tags" tags={tags} onChange={onChange} {...over} />);
  return { onChange, field: screen.getByRole("textbox", { name: "Tags" }) as HTMLInputElement };
}

function type(field: HTMLInputElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

test("tag_field_enter_adds_a_chip", () => {
  const { onChange, field } = setup();
  type(field, " Deep ");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith(["Writing", "Deep"]);
  expect(field.value).toBe("");
});

test("tag_field_comma_adds_a_chip", () => {
  const { onChange, field } = setup();
  type(field, "Deep");
  fireEvent.keyDown(field, { key: "," });
  expect(onChange).toHaveBeenCalledWith(["Writing", "Deep"]);
});

test("tag_field_pasted_commas_add_several", () => {
  const { onChange, field } = setup([]);
  type(field, "a, b,c");
  expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  expect(field.value).toBe("c");
});

test("tag_field_refuses_a_duplicate_ignoring_case_with_a_line", () => {
  const { onChange, field } = setup();
  type(field, "writing");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText("writing is already a tag.")).toBeTruthy();
  expect(field.value).toBe("writing");
});

test("tag_field_blur_adds_the_typed_tag", () => {
  const { onChange, field } = setup([]);
  type(field, "calm");
  fireEvent.blur(field);
  expect(onChange).toHaveBeenCalledWith(["calm"]);
});

test("tag_field_remove_button_moves_focus_to_a_neighbour", () => {
  setup(["Writing", "Planning"]);
  const first = screen.getAllByRole("button", { name: /Remove tag/ })[0] as HTMLElement;
  first.focus();
  fireEvent.click(first);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove tag Planning" }));
});

test("tag_field_refuses_past_max_and_past_length", () => {
  const { onChange, field } = setup(["a", "b"], { max: 2 });
  type(field, "c");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText("A task holds up to 2 tags.")).toBeTruthy();
});

test("tag_field_refuses_a_long_tag", () => {
  const { onChange, field } = setup([], { maxLength: 5 });
  type(field, "toolong");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText("A tag is up to 5 characters.")).toBeTruthy();
});

test("tag_field_default_limits_are_8_tags_of_24_characters", () => {
  const eight = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const { onChange, field } = setup(eight);
  type(field, "9");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText("A task holds up to 8 tags.")).toBeTruthy();
});

test("tag_field_each_chip_has_a_named_remove_button_with_a_hit_min_area", () => {
  const { onChange } = setup(["Writing", "Deep"]);
  const remove = screen.getByRole("button", { name: "Remove tag Deep" });
  expect(remove.className).toContain("before:size-hit-min");
  fireEvent.click(remove);
  expect(onChange).toHaveBeenCalledWith(["Writing"]);
});

test("tag_field_chips_are_a_list", () => {
  setup(["Writing", "Deep"]);
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Writing", "Deep"]);
});
