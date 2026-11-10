import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TimeBlock } from "./time-block";

const types = [
  ["deep", "Deep"],
  ["shallow", "Shallow"],
  ["break", "Break"],
  ["routine", "Routine"],
  ["personal", "Personal"],
  ["overflow", "Overflow"],
] as const;

test.each(types)("renders_%s_with_word_or_shape", (type, word) => {
  const { container } = render(<TimeBlock type={type} start="09:00" end="10:00" />);
  expect(screen.getByText(`${word} · 09:00–10:00`)).toBeTruthy();
  expect(container.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  expect(container.querySelector("[data-slot=time-block]")?.getAttribute("aria-label")).toBe(
    `${word}, ${word}, 09:00 to 10:00`,
  );
});

test("renders_now_with_word", () => {
  render(<TimeBlock title="Write" now start="09:00" end="10:00" />);
  expect(screen.getByText("Now · Write")).toBeTruthy();
  expect(screen.getByLabelText("Now, Write, Deep, 09:00 to 10:00")).toBeTruthy();
});

test("renders_selected_with_word", () => {
  render(<TimeBlock title="Write" selected start="09:00" end="10:00" />);
  expect(screen.getByText("Deep · 09:00–10:00 · Selected")).toBeTruthy();
});

test("renders_compact_when_short", () => {
  const { container } = render(<TimeBlock title="Quick" height={30} start="09:00" end="09:15" />);
  expect(screen.getByText("09:00")).toBeTruthy();
  expect((container.firstElementChild as HTMLElement).style.height).toBe("30px");
});

test("height_floor_is_24px", () => {
  const { container } = render(<TimeBlock height="10px" />);
  expect((container.firstElementChild as HTMLElement).style.height).toBe("24px");
});

test("exposes_button_with_name", () => {
  const onSelect = vi.fn();
  render(<TimeBlock title="Write" start="09:00" end="10:00" onSelect={onSelect} />);
  const b = screen.getByRole("button", { name: "Write, Deep, 09:00 to 10:00" });
  b.click();
  expect(onSelect).toHaveBeenCalledOnce();
});

test("static_block_is_not_a_button", () => {
  render(<TimeBlock />);
  expect(screen.queryByRole("button")).toBeNull();
});

test("compact_omits_type_word", () => {
  render(<TimeBlock type="break" compact start="09:00" end="09:15" />);
  expect(screen.queryByText(/Break ·/)).toBeNull();
  expect(screen.getByText("09:00")).toBeTruthy();
});

test("overflow_strip_is_hidden_and_word_present", () => {
  const { container } = render(<TimeBlock type="overflow" start="09:00" end="10:00" />);
  expect(container.querySelector("span[aria-hidden=true].border-dashed")).not.toBeNull();
  expect(screen.getByText("Overflow · 09:00–10:00")).toBeTruthy();
});

test("disabled_button_does_not_fire", () => {
  const onSelect = vi.fn();
  render(<TimeBlock title="Write" disabled onSelect={onSelect} />);
  const b = screen.getByRole("button") as HTMLButtonElement;
  expect(b.disabled).toBe(true);
  expect(b.className).toContain("disabled:border-dashed");
  b.click();
  expect(onSelect).not.toHaveBeenCalled();
});
