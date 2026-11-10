import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TaskCard } from "./task-card";

test("exposes_button_with_name", () => {
  const onOpen = vi.fn();
  render(
    <TaskCard
      title="Write"
      type="shallow"
      frog
      estimate={3}
      done={1}
      tracked="0h 25m"
      project="Book"
      onOpen={onOpen}
    />,
  );
  const card = screen.getByRole("button", {
    name: "Write, Shallow, Frog, 1 sessions done, 3 estimated, 0h 25m, Book",
  });
  fireEvent.click(card);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test("renders_read_only_article_without_tab_stop", () => {
  const { container } = render(<TaskCard title="Write" />);
  expect(screen.queryByRole("button")).toBeNull();
  const card = container.querySelector("[data-slot=task-card]");
  expect(card?.tagName).toBe("ARTICLE");
  expect(card?.hasAttribute("tabindex")).toBe(false);
});

test("renders_meta_line_with_estimate", () => {
  render(<TaskCard title="Write" estimate={3} done={1} tracked="0h 25m" />);
  expect(screen.getByText("Est 3 · Done 1 · 0h 25m")).toBeTruthy();
});

test("renders_no_estimate_with_word", () => {
  render(<TaskCard title="Write" />);
  expect(screen.getByText("No estimate · Done 0")).toBeTruthy();
});

test("renders_deep_and_shallow_with_word_or_shape", () => {
  const { rerender } = render(<TaskCard title="Write" />);
  expect(screen.getByText("Deep")).toBeTruthy();
  rerender(<TaskCard title="Write" type="shallow" />);
  expect(screen.getByText("Shallow")).toBeTruthy();
});

test("renders_frog_with_word_or_shape", () => {
  render(<TaskCard title="Write" frog />);
  expect(screen.getByText("Frog")).toBeTruthy();
});

test("renders_active_with_word_or_shape", () => {
  render(<TaskCard title="Write" active onOpen={() => {}} />);
  expect(screen.getByText("In progress")).toBeTruthy();
  expect(screen.getByRole("button", { name: /In progress$/ })).toBeTruthy();
});

test("renders_selected_with_word_or_shape", () => {
  render(<TaskCard title="Write" selected />);
  expect(screen.getByText("Selected")).toBeTruthy();
});

test("renders_active_and_selected_words_joined", () => {
  render(<TaskCard title="Write" active selected />);
  expect(screen.getByText("In progress · Selected")).toBeTruthy();
});

test("renders_dots_capped_at_twelve_with_over_marks", () => {
  const { container } = render(<TaskCard title="Write" estimate={2} done={15} />);
  const dots = container.querySelectorAll("[data-slot=task-card-dot]");
  expect(dots.length).toBe(12);
  expect(container.querySelectorAll("[data-over]").length).toBe(10);
  expect(container.querySelectorAll("[data-done]").length).toBe(12);
});

test("renders_disabled_button_not_clickable", () => {
  const onOpen = vi.fn();
  render(<TaskCard title="Write" disabled onOpen={onOpen} />);
  const card = screen.getByRole("button") as HTMLButtonElement;
  expect(card.disabled).toBe(true);
  fireEvent.click(card);
  expect(onOpen).not.toHaveBeenCalled();
});
