import type { BoardView_Serialize, TaskView_Serialize } from "@shared/ipc/bindings";
import {
  type Backend,
  boardOf,
  boardTask,
  mockBackend,
  type Replies,
  SETTINGS,
  settle,
} from "@shared/test/fixtures";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { BoardPage } from "./BoardPage";

/** Backlog two, Today two, Doing one, Done one. */
export const TASKS: TaskView_Serialize[] = [
  boardTask("b1", "Draft outline", "backlog"),
  boardTask("b2", "Book dentist", "backlog"),
  boardTask("t1", "Write intro", "today", { estimate: 2, planned: 3 }),
  boardTask("t2", "Reply to Ana", "today"),
  boardTask("d1", "Fix sync bug", "doing", { active: true }),
  boardTask("x1", "Ship release", "done"),
];

type Options = {
  board?: BoardView_Serialize;
  singleKey?: boolean;
  replies?: Replies;
  onOpenTask?: (id: string) => void;
  /** Other props of the page (the import entry points). */
  page?: Partial<ComponentProps<typeof BoardPage>>;
};

export async function renderBoard(options: Options = {}): Promise<Backend> {
  const board = options.board ?? boardOf(TASKS);
  const backend = mockBackend({
    board_get: () => board,
    settings_get: () => ({ ...SETTINGS, singleKey: options.singleKey ?? true }),
    task_add: (args) =>
      boardTask("new", (args as { draft: { title: string } }).draft.title, "backlog"),
    task_move: () => null,
    task_set_frog: () => null,
    task_remove: () => null,
    task_restore: () => null,
    ...options.replies,
  });
  render(<BoardPage onNavigate={() => {}} onOpenTask={options.onOpenTask} {...options.page} />);
  await settle();
  return backend;
}

/** The card's button, by its title (the accessible name starts with it). */
export const card = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title}`) });

// jsdom has no layout and no pointer capture; these two make a drag testable.
const COLUMN_WIDTH = 200;
const STRIP_WIDTH = 40;
const GAP = 10;
const CARD_HEIGHT = 50;
const CARD_STEP = 60;

type Box = { left: number; top: number; right: number; bottom: number };

function boxOf(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height };
}

/** Where a column starts: sections are 200 wide, strips 40, with a gap of 10, in DOM order. */
function columnLeft(el: Element): { left: number; width: number } {
  const all = [...document.querySelectorAll("[id^=board-col-]")];
  let left = 0;
  for (const other of all) {
    const width = other.tagName === "BUTTON" ? STRIP_WIDTH : COLUMN_WIDTH;
    if (other === el) return { left, width };
    left += width + GAP;
  }
  return { left: 0, width: 0 };
}

/**
 * Gives the board a layout: columns left to right (sections 200 wide, strips 40, gap 10, 600 tall);
 * in a column the cards start at y 40, 50 tall and 60 apart, and Backlog's New task field takes the
 * first slot (cards from y 100). Every card is 50 tall, so its midpoint is 25 below its top.
 * Call `spy.mockRestore()` (or `vi.restoreAllMocks()`) to remove it.
 */
export function stubRects() {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ) {
    const zero = boxOf(0, 0, 0, 0);
    const make = (b: Box): DOMRect => ({
      ...b,
      x: b.left,
      y: b.top,
      width: b.right - b.left,
      height: b.bottom - b.top,
      toJSON: () => b,
    });
    if (this.matches("[data-slot=scroll-region]")) return make(boxOf(0, 0, 900, 600));
    if (this.id.startsWith("board-col-")) {
      const { left, width } = columnLeft(this);
      return make(boxOf(left, 0, width, 600));
    }
    const column = this.closest("[id^=board-col-]");
    if (!column) return make(zero);
    const { left, width } = columnLeft(column);
    if (this.matches("[data-slot=kanban-column-cards]")) return make(boxOf(left, 30, width, 560));
    if (this.hasAttribute("data-task-id")) {
      const cards = [...(this.parentElement?.querySelectorAll(":scope > [data-task-id]") ?? [])];
      const lead = this.parentElement?.querySelector("#board-new-task") ? 1 : 0;
      const top = 40 + (lead + cards.indexOf(this)) * CARD_STEP;
      return make(boxOf(left, top, width, CARD_HEIGHT));
    }
    return make(zero);
  });
}

/** Installs `setPointerCapture` and `releasePointerCapture` (jsdom has neither). */
export function stubPointerCapture() {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}

type PointerKind = "pointerdown" | "pointermove" | "pointerup" | "pointercancel";

/** Fires a pointer event at `target`; jsdom's MouseEvent carries the position and a pointer type is added. */
export function pointer(
  type: PointerKind,
  target: Element | Window,
  x: number,
  y: number,
  init: { pointerType?: string; button?: number } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: init.button ?? 0,
  });
  Object.defineProperty(event, "pointerType", { value: init.pointerType ?? "mouse" });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(target, event);
}
