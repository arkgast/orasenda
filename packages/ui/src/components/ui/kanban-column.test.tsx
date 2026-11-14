import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { KanbanColumn } from "./kanban-column";

test("exposes_region_with_name", () => {
  render(<KanbanColumn title="Today" count={1} limit={3} />);
  const region = screen.getByRole("region", { name: "Today" });
  expect(region.getAttribute("data-slot")).toBe("kanban-column");
  expect(screen.getByRole("heading", { level: 2, name: "Today" })).toBeTruthy();
});

test("renders_below_limit_with_word_or_shape", () => {
  render(<KanbanColumn title="Today" count={1} limit={3} />);
  expect(screen.getByText("1 of 3")).toBeTruthy();
  expect(screen.queryByText("At limit")).toBeNull();
});

test("renders_at_limit_with_word_or_shape", () => {
  render(<KanbanColumn title="Today" count={3} limit={3} />);
  const caption = screen.getByText("At limit");
  expect(caption.getAttribute("data-slot")).toBeNull();
});

test("count_reads_words_at_and_over_limit", () => {
  const { rerender } = render(<KanbanColumn title="Today" count={2} limit={3} />);
  expect(screen.getByText("2 of 3").getAttribute("data-slot")).toBeNull();
  rerender(<KanbanColumn title="Today" count={3} limit={3} />);
  expect(screen.getByText("At limit").getAttribute("data-slot")).toBeNull();
  rerender(<KanbanColumn title="Today" count={4} limit={3} />);
  const chip = screen.getByText("4 of 3");
  expect(chip.getAttribute("data-slot")).toBe("mode-chip");
  expect(chip.getAttribute("data-mode")).toBe("warning");
});

test("renders_over_limit_with_word_or_shape", () => {
  render(<KanbanColumn title="Today" count={4} limit={3} />);
  expect(screen.getByText("4 of 3")).toBeTruthy();
});

test("renders_no_limit_as_task_count", () => {
  render(<KanbanColumn title="Inbox" count={2} />);
  expect(screen.getByText("2 tasks")).toBeTruthy();
});

test("clamps_bad_counts_to_zero", () => {
  render(<KanbanColumn title="Inbox" count={Number.NaN} limit={-2} />);
  expect(screen.getByText("At limit")).toBeTruthy();
});

test("renders_empty_message_when_no_children", () => {
  render(<KanbanColumn title="Inbox" count={0} />);
  expect(screen.getByText("Nothing here yet. That's fine.")).toBeTruthy();
  render(<KanbanColumn title="Done" count={0} emptyMessage="All clear." />);
  expect(screen.getByText("All clear.")).toBeTruthy();
});

test("renders_children_instead_of_empty_message", () => {
  render(
    <KanbanColumn title="Today" count={1}>
      <article>Write notes</article>
    </KanbanColumn>,
  );
  expect(screen.getByText("Write notes")).toBeTruthy();
  expect(screen.queryByText("Nothing here yet. That's fine.")).toBeNull();
});

test("footer_renders_under_cards", () => {
  render(
    <KanbanColumn title="Today" count={1} footer={<button type="button">Add task</button>}>
      <article>Write notes</article>
    </KanbanColumn>,
  );
  const card = screen.getByText("Write notes");
  const footer = screen.getByRole("button", { name: "Add task" });
  expect(card.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("cards_scroll_inside_the_column", () => {
  const { container } = render(
    <KanbanColumn title="Today" count={1}>
      <article>Write notes</article>
    </KanbanColumn>,
  );
  expect(container.querySelector("[data-slot=kanban-column-cards]")?.className).toContain(
    "overflow-y-auto",
  );
});

test("wide_width_uses_the_wide_token", () => {
  const { container } = render(<KanbanColumn title="Today" count={0} width="wide" />);
  const section = container.querySelector("[data-slot=kanban-column]");
  expect(section?.className).toContain("max-w-column-wide-width");
  expect(section?.className).not.toContain("max-w-column-width");
});

test("action_slot_renders_in_header", () => {
  render(<KanbanColumn title="Today" count={0} action={<button type="button">Column menu</button>} />);
  expect(screen.getByRole("button", { name: "Column menu" })).toBeTruthy();
});

test("collapsed_is_a_strip_button_with_aria_expanded", () => {
  const onToggle = vi.fn();
  render(<KanbanColumn title="Done" count={5} collapsed onToggle={onToggle} />);
  const strip = screen.getByRole("button", { name: "Done, 5 tasks" });
  expect(strip.getAttribute("aria-expanded")).toBe("false");
  expect(strip.className).toContain("w-column-strip-width");
  expect(screen.queryByRole("region")).toBeNull();
  fireEvent.click(strip);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test("expanded_with_toggle_offers_a_fold_button", () => {
  const onToggle = vi.fn();
  render(<KanbanColumn title="Doing" count={1} limit={1} onToggle={onToggle} />);
  const fold = screen.getByRole("button", { name: "Fold Doing" });
  expect(fold.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(fold);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test("id_lands_on_the_region_for_roving", () => {
  render(<KanbanColumn id="col-today" title="Today" count={0} />);
  expect(screen.getByRole("region", { name: "Today" }).id).toBe("col-today");
});
