import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

test("renders_active_and_selected_words", () => {
  render(<TaskCard title="Write" active selected />);
  expect(screen.getByText("In progress")).toBeTruthy();
  expect(screen.getByText("Selected")).toBeTruthy();
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

test("disabled_button_has_dashed_border_shape", () => {
  render(<TaskCard title="Write" disabled onOpen={() => {}} />);
  expect(screen.getByRole("button").className).toContain("disabled:border-dashed");
});

test("button_label_says_no_estimate_when_none", () => {
  render(<TaskCard title="Write" onOpen={() => {}} />);
  expect(screen.getByRole("button").getAttribute("aria-label")).toContain("no estimate");
});

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

test("card_name_includes_due_priority_tags", () => {
  render(
    <TaskCard
      title="Write"
      frog
      estimate={3}
      done={1}
      due="Due Friday"
      priority="high"
      tags={["book", "draft", "third"]}
      checklist={{ done: 2, total: 5 }}
      onOpen={() => {}}
    />,
  );
  const name = screen.getByRole("button").getAttribute("aria-label") ?? "";
  expect(name).toContain("Frog");
  expect(name).toContain("Due Friday");
  expect(name).toContain("High priority");
  expect(name).toContain("book, draft");
  expect(name).not.toContain("third");
  expect(name).toContain("2 of 5 checklist items done");
  expect(screen.getByText("High")).toBeTruthy();
  expect(screen.getByText("2 of 5")).toBeTruthy();
  expect(screen.getByText("Due Friday")).toBeTruthy();
  expect(screen.queryByText("third")).toBeNull();
});

test("select_on_click_and_open_on_double_click_and_return", () => {
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  render(<TaskCard title="Write" onSelect={onSelect} onOpen={onOpen} />);
  const card = screen.getByRole("button");
  fireEvent.click(card);
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.doubleClick(card);
  expect(onOpen).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(card, { key: "Enter" });
  expect(onOpen).toHaveBeenCalledTimes(2);
});

test("select_alone_makes_a_button_that_selects", () => {
  const onSelect = vi.fn();
  render(<TaskCard title="Write" onSelect={onSelect} selected />);
  fireEvent.click(screen.getByRole("button"));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Selected");
  expect(screen.getByText("Selected")).toBeTruthy();
});

test("key_down_passes_through", () => {
  const onKeyDown = vi.fn();
  render(<TaskCard title="Write" onOpen={() => {}} onKeyDown={onKeyDown} />);
  fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});

test("row_density_is_a_single_line", () => {
  const { container } = render(
    <TaskCard title="Write" density="row" estimate={3} done={1} onOpen={() => {}} />,
  );
  const card = container.querySelector("[data-slot=task-card]");
  expect(card?.getAttribute("data-density")).toBe("row");
  expect(card?.className).toContain("min-h-hit-min");
  expect(container.querySelector("[data-slot=task-card-dots]")).toBeNull();
  expect(screen.getByText("Deep")).toBeTruthy();
  expect(screen.getByText("Est 3")).toBeTruthy();
});

test("row_read_only_has_no_button", () => {
  const { container } = render(<TaskCard title="Write" density="row" />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(container.querySelector("[data-slot=task-card]")?.tagName).toBe("ARTICLE");
});

test("card_menu_offers_move_targets", () => {
  const onMove = vi.fn();
  const onFrog = vi.fn();
  const onRemove = vi.fn();
  render(
    <TaskCard
      title="Write"
      onOpen={() => {}}
      menu={{
        moveTargets: [
          { id: "today", label: "Today" },
          { id: "doing", label: "Doing" },
        ],
        onMove,
        onFrog,
        onRemove,
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "More actions for Write" }));
  const menu = screen.getByRole("menu");
  const trigger = screen.getByRole("button", { name: "More actions for Write" });
  expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
  expect(within(menu).getByRole("menuitem", { name: "Move to Today" })).toBeTruthy();
  expect(within(menu).getByRole("menuitem", { name: "Move to Doing" })).toBeTruthy();
  expect(within(menu).getByRole("menuitem", { name: "Make Frog" })).toBeTruthy();
  fireEvent.keyDown(within(menu).getByRole("menuitem", { name: "Move to Doing" }), {
    key: "Enter",
  });
  expect(onMove).toHaveBeenCalledWith("doing");
});

test("card_menu_remove_and_frog_call_back", () => {
  const onFrog = vi.fn();
  const onRemove = vi.fn();
  render(
    <TaskCard title="Write" frog menu={{ moveTargets: [], onMove: () => {}, onFrog, onRemove }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "More actions for Write" }));
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Unmark Frog" }), { key: "Enter" });
  expect(onFrog).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "More actions for Write" }));
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Remove" }), { key: "Enter" });
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test("disabled_card_has_no_menu", () => {
  render(
    <TaskCard
      title="Write"
      disabled
      onOpen={() => {}}
      menu={{ moveTargets: [{ id: "today", label: "Today" }], onMove: () => {} }}
    />,
  );
  expect(screen.queryByRole("button", { name: "More actions for Write" })).toBeNull();
});

test("duplicate_tags_render_once", () => {
  render(<TaskCard title="Write" tags={["home", "home", "work"]} />);
  expect(screen.getAllByText("home")).toHaveLength(1);
});

const LONG = `${"A task title that goes on and on, ".repeat(9)}`.trim();

test("long_title_keeps_full_accessible_name", () => {
  const { container, rerender } = render(<TaskCard title={LONG} onOpen={() => {}} />);
  expect(screen.getByRole("button", { name: (n) => n.startsWith(`${LONG},`) })).toBeTruthy();
  let title = container.querySelector("[data-slot=task-card-title]");
  expect(title?.className).toContain("line-clamp-3");

  rerender(<TaskCard title={LONG} />);
  title = container.querySelector("[data-slot=task-card-title]");
  expect(title?.getAttribute("aria-hidden")).toBe("true");
  expect(title?.className).toContain("line-clamp-3");
  expect(
    within(screen.getByRole("article")).getByText(LONG, { ignore: "[aria-hidden=true]" }),
  ).toBeTruthy();

  rerender(<TaskCard title={LONG} density="row" />);
  expect(container.querySelector("[data-slot=task-card-title]")?.className).not.toContain(
    "line-clamp",
  );
});

test("no_estimate_and_nothing_done_draws_no_dots", () => {
  const { container, rerender } = render(<TaskCard title="Write" />);
  expect(container.querySelector("[data-slot=task-card-dots]")).toBeNull();
  rerender(<TaskCard title="Write" estimate={2} />);
  expect(container.querySelector("[data-slot=task-card-dots]")).not.toBeNull();
  rerender(<TaskCard title="Write" done={1} />);
  expect(container.querySelector("[data-slot=task-card-dots]")).not.toBeNull();
});

const MENU = {
  moveTargets: [{ id: "doing", label: "Doing" }],
  onMove: () => {},
  onRemove: () => {},
};

function pressOnCard(init: KeyboardEventInit) {
  const card = screen.getByRole("button", { name: /^Write/ });
  card.focus();
  fireEvent.keyDown(card, init);
  return card;
}

test("roving_card_more_button_is_not_a_tab_stop", () => {
  const { rerender } = render(
    <TaskCard title="Write" onOpen={() => {}} menu={MENU} menuTabIndex={-1} />,
  );
  expect(screen.getByRole("button", { name: "More actions for Write" })).toHaveAttribute(
    "tabindex",
    "-1",
  );
  rerender(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  expect(screen.getByRole("button", { name: "More actions for Write" })).toHaveAttribute(
    "tabindex",
    "0",
  );
});

test("more_button_names_shift_f10", () => {
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  const more = screen.getByRole("button", { name: "More actions for Write" });
  expect(more).toHaveAttribute("aria-keyshortcuts", "Shift+F10");
  vi.useFakeTimers();
  fireEvent.pointerEnter(more);
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(document.querySelector("[data-slot=tooltip] [data-slot=kbd]")?.textContent).toBe("⇧F10");
  vi.useRealTimers();
});

test("shift_f10_opens_card_menu", () => {
  const onKeyDown = vi.fn();
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} onKeyDown={onKeyDown} />);
  pressOnCard({ key: "F10", shiftKey: true });
  const menu = screen.getByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Move to Doing" })).toHaveFocus();
  expect(onKeyDown).toHaveBeenCalledTimes(1);
  expect(onKeyDown.mock.calls[0][0].defaultPrevented).toBe(true);
});

test("context_menu_key_opens_card_menu", () => {
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  pressOnCard({ key: "ContextMenu" });
  expect(
    within(screen.getByRole("menu")).getByRole("menuitem", { name: "Move to Doing" }),
  ).toHaveFocus();
});

test("esc_returns_focus_to_card_after_key_open", () => {
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  const card = pressOnCard({ key: "F10", shiftKey: true });
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Move to Doing" }), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(card).toHaveFocus();
});

test("choose_returns_focus_to_card_after_key_open", () => {
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  const card = pressOnCard({ key: "ContextMenu" });
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Remove" }), { key: "Enter" });
  expect(card).toHaveFocus();
});

test("click_open_returns_focus_to_more_button", () => {
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  const more = screen.getByRole("button", { name: "More actions for Write" });
  fireEvent.click(more);
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Move to Doing" }), { key: "Escape" });
  expect(more).toHaveFocus();
});

test("native_contextmenu_prevented_after_key_open", () => {
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  pressOnCard({ key: "F10", shiftKey: true });
  // The key-opened menu holds focus, so the native event arrives on the focused item.
  const item = document.activeElement as HTMLElement;
  expect(item).toHaveAttribute("role", "menuitem");
  expect(fireEvent.contextMenu(item)).toBe(false);
});

test("right_click_after_esc_is_not_prevented", () => {
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  const card = pressOnCard({ key: "F10", shiftKey: true });
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Move to Doing" }), { key: "Escape" });
  expect(fireEvent.contextMenu(card)).toBe(true);
});

test("menu_key_while_open_does_nothing", () => {
  render(<TaskCard title="Write" onOpen={() => {}} menu={MENU} />);
  const more = screen.getByRole("button", { name: "More actions for Write" });
  fireEvent.click(more);
  const card = screen.getByRole("button", { name: /^Write/ });
  fireEvent.keyDown(card, { key: "F10", shiftKey: true });
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Move to Doing" }), { key: "Escape" });
  expect(more).toHaveFocus();
});

test("disabled_or_menuless_card_ignores_menu_key", () => {
  const { rerender } = render(<TaskCard title="Write" onOpen={() => {}} />);
  pressOnCard({ key: "F10", shiftKey: true });
  expect(screen.queryByRole("menu")).toBeNull();
  rerender(<TaskCard title="Write" onOpen={() => {}} menu={MENU} disabled />);
  const card = screen.getByRole("button", { name: /^Write/ });
  fireEvent.keyDown(card, { key: "ContextMenu" });
  expect(screen.queryByRole("menu")).toBeNull();
});
