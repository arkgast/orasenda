import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";

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

test("cards_keep_the_focus_ring_in_view_when_scrolled", () => {
  const { container } = render(
    <KanbanColumn title="Today" count={1}>
      <article>Write notes</article>
    </KanbanColumn>,
  );
  expect(container.querySelector("[data-slot=kanban-column-cards]")?.className).toContain(
    "scroll-py-1",
  );
});

test("wide_width_uses_the_wide_token", () => {
  const { container } = render(<KanbanColumn title="Today" count={0} width="wide" />);
  const section = container.querySelector("[data-slot=kanban-column]");
  expect(section?.className).toContain("max-w-column-wide-width");
  expect(section?.className).not.toContain("max-w-column-width");
});

test("action_slot_renders_in_header", () => {
  render(
    <KanbanColumn title="Today" count={0} action={<button type="button">Column menu</button>} />,
  );
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

test("empty_array_children_show_empty_message", () => {
  render(
    <KanbanColumn title="Backlog" count={0}>
      {[]}
    </KanbanColumn>,
  );
  expect(screen.getByText("Nothing here yet. That's fine.")).toBeTruthy();
});

test("one_task_reads_singular", () => {
  render(<KanbanColumn title="Done" count={1} collapsed onToggle={() => {}} />);
  expect(screen.getByRole("button", { name: "Done, 1 task" })).toBeTruthy();
});

test("folded_over_limit_strip_shows_alert_shape_and_count", () => {
  render(<KanbanColumn title="Today" count={4} limit={3} collapsed onToggle={() => {}} />);
  const strip = screen.getByRole("button", { name: "Today, 4 of 3" });
  expect(strip.querySelector("[data-slot=kanban-column-strip-over]")?.textContent).toContain("4");
});

function Host() {
  const [folded, setFolded] = useState(false);
  return (
    <KanbanColumn
      title="Done"
      count={2}
      collapsed={folded as true}
      onToggle={() => setFolded(true)}
    />
  );
}

test("fold_moves_focus_to_the_strip", () => {
  render(<Host />);
  fireEvent.click(screen.getByRole("button", { name: "Fold Done" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Done, 2 tasks" }));
});

test("drop_slot_at_index", () => {
  const { container } = render(
    <KanbanColumn title="Today" count={2} drop={{ index: 1, label: "Moving Plan here" }}>
      <TaskCard title="one" onOpen={() => {}} />
      <TaskCard title="two" onOpen={() => {}} />
    </KanbanColumn>,
  );
  const cards = container.querySelector("[data-slot=kanban-column-cards]") as HTMLElement;
  const kids = Array.from(cards.children);
  const slot = cards.querySelector("[data-slot=kanban-column-drop]") as HTMLElement;
  expect(kids.indexOf(slot)).toBe(1);
  expect(slot.textContent).toBe("Moving Plan here");
  expect(slot.classList.contains("border-dashed")).toBe(true);
  expect(slot.className).toContain("border-line-strong");
  expect(slot.className).toContain("min-h-hit-min");
});

test("drop_slot_index_is_clamped_and_replaces_empty_message", () => {
  const { container, rerender } = render(
    <KanbanColumn title="Today" count={1} drop={{ index: 9, label: "Moving A here" }}>
      <TaskCard title="one" onOpen={() => {}} />
    </KanbanColumn>,
  );
  const cards = container.querySelector("[data-slot=kanban-column-cards]") as HTMLElement;
  expect(cards.lastElementChild?.getAttribute("data-slot")).toBe("kanban-column-drop");
  rerender(<KanbanColumn title="Today" count={0} drop={{ index: 0, label: "Moving A here" }} />);
  expect(screen.queryByText("Nothing here yet. That's fine.")).toBeNull();
  expect(screen.getByText("Moving A here")).toBeTruthy();
});

test("drop_on_strip_reads_move_here", () => {
  const { container } = render(
    <KanbanColumn
      title="Done"
      count={5}
      collapsed
      onToggle={() => {}}
      drop={{ index: 3, label: "Moving A here" }}
    />,
  );
  const strip = container.querySelector("[data-slot=kanban-column-strip]") as HTMLElement;
  expect(strip.className).toContain("bg-selection");
  expect(strip.className).toContain("inset-ring-line-strong");
  expect(screen.getByText("Move here")).toBeTruthy();
  expect(container.querySelector("[data-slot=kanban-column-drop]")).toBeNull();
  expect(screen.getByRole("button", { name: "Done, 5 tasks, Move here" })).toBe(strip);
});

function Wrap({ n }: { n: string }) {
  return <div>{n}</div>;
}

test("drop_index_counts_children_as_passed", () => {
  const { container } = render(
    <KanbanColumn title="Today" count={2} drop={{ index: 1, label: "Moving A here" }}>
      <Wrap n="one" />
      <Wrap n="two" />
    </KanbanColumn>,
  );
  const cards = container.querySelector("[data-slot=kanban-column-cards]") as HTMLElement;
  const order = Array.from(cards.children).map((el) =>
    el.getAttribute("data-slot") === "kanban-column-drop" ? "slot" : el.textContent,
  );
  expect(order).toEqual(["one", "slot", "two"]);
});

test("drop_slot_never_shrinks", () => {
  const { container } = render(
    <KanbanColumn title="Today" count={0} drop={{ index: 0, label: "Moving a long title here" }} />,
  );
  expect(container.querySelector("[data-slot=kanban-column-drop]")?.className).toContain(
    "shrink-0",
  );
});

test("drop_slot_transitions_calm", () => {
  render(<KanbanColumn title="Today" count={0} drop={{ index: 0, label: "Moving here" }} />);
  const cls = document.querySelector("[data-slot=kanban-column-drop]")?.className ?? "";
  expect(cls).toMatch(/\btransition-\[?[a-z-]+/);
  expect(cls).toContain("duration-calm");
  expect(cls).toContain("ease-calm");
});

test("drop_slot_instant_reduce_motion", () => {
  render(<KanbanColumn title="Today" count={0} drop={{ index: 0, label: "Moving here" }} />);
  expect(document.querySelector("[data-slot=kanban-column-drop]")?.className).toContain(
    "motion-reduce:transition-none",
  );
});
