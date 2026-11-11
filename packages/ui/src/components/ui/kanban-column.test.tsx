import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
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
  const chip = screen.getByText("At limit");
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
