import type { ColumnView, Lane, TaskView } from "@shared/ipc/bindings";
import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { columnId, locate, neighbour } from "./lanes";

const NO_SCROLL = { preventScroll: true } as const;
const CARD = 'button[data-slot="task-card"]';
const STRIP = '[data-slot="kanban-column-strip"]';
/** What holds focus in a column with no card: its strip, its name button or its heading. */
const STOP = `${STRIP}, [data-slot="kanban-column-name"], h2[tabindex]`;

type Actions = {
  moveToColumn(task: TaskView, lane: Lane): Promise<boolean>;
  reorder(task: TaskView, delta: -1 | 1): Promise<boolean>;
  dropAt(task: TaskView, lane: Lane, index: number): Promise<boolean>;
  toggleFrog(task: TaskView): Promise<boolean>;
  remove(task: TaskView): Promise<boolean>;
  startOn(task: TaskView): Promise<boolean>;
};

type Args = {
  root: RefObject<HTMLElement | null>;
  columns: readonly ColumnView[];
  /** The lanes shown open, in column order. */
  open: readonly Lane[];
  /** `Settings.singleKey`: F works only while it is on. */
  singleKeys: boolean;
  actions: Actions;
};

/**
 * The Board's page keys (spec "Board page"): arrows rove, ⌥⌘ arrows move or reorder, ⌘⌫ removes,
 * ⌘⏎ starts on the card, F flags the Frog. They are handled here, in the board's own capture
 * handler, and not through the key registry: the shared single-key hook fires only at rest and
 * the shortcut hook drops ⌥ chords. Capture, because the card's own Return rule would otherwise
 * open the detail on ⌘⏎ as well. Only one card is a tab stop, so Tab crosses the board in one stop.
 */
export function useBoardKeys({ root, columns, open, singleKeys, actions }: Args) {
  const [selected, setSelected] = useState<string | null>(null);
  const pending = useRef<{ id: string; lane: Lane } | null>(null);

  const cardButton = (id: string) =>
    root.current?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"] ${CARD}`);
  const lane = (l: Lane) =>
    Array.from(root.current?.querySelectorAll<HTMLElement>(`#${columnId(l)} ${CARD}`) ?? []);

  // After every render: one tab stop (the selected card, else the first), and focus follows a card
  // that moved to another column once it shows there.
  useLayoutEffect(() => {
    const buttons = Array.from(root.current?.querySelectorAll<HTMLElement>(CARD) ?? []);
    const idOf = (b: HTMLElement) => b.closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
    const stop = buttons.find((b) => idOf(b) === selected) ?? buttons[0];
    for (const b of buttons) b.tabIndex = b === stop ? 0 : -1;
    const want = pending.current;
    if (!want) return;
    const wrap = root.current?.querySelector<HTMLElement>(
      `[data-task-id="${CSS.escape(want.id)}"]`,
    );
    if (wrap?.dataset.lane === want.lane) {
      pending.current = null;
      wrap.querySelector<HTMLElement>(CARD)?.focus();
    }
  });

  /** After a card leaves its place: the card next to it, else the heading. */
  const focusBeside = (task: TaskView) => {
    const at = locate(columns, task.id);
    const next = at?.column.tasks[at.index + 1] ?? at?.column.tasks[at.index - 1];
    const target = next ? cardButton(next.id) : document.querySelector<HTMLElement>("h1");
    target?.focus();
  };

  /** The next column over: its card at `index` (or the last), else its strip, name or heading. */
  const stepColumn = (from: Lane, index: number, direction: -1 | 1) => {
    const to = neighbour(columns, from, direction);
    if (to === null) return;
    const cards = lane(to);
    const column = document.getElementById(columnId(to));
    if (cards.length) return void cards[Math.min(index, cards.length - 1)]?.focus(NO_SCROLL);
    if (!column) return;
    if (column.matches(STRIP)) return void column.focus(NO_SCROLL);
    const name = column.querySelector<HTMLElement>('[data-slot="kanban-column-name"]');
    const heading = column.querySelector<HTMLElement>("h2");
    heading?.setAttribute("tabindex", "-1");
    (name ?? heading)?.focus(NO_SCROLL);
  };

  /** Moves a card to `to`; focus follows it when that column is open, else lands beside it. */
  const moveTo = async (task: TaskView, to: Lane) => {
    if (!(await actions.moveToColumn(task, to))) return;
    if (open.includes(to)) pending.current = { id: task.id, lane: to };
    else focusBeside(task);
  };

  /** A pointer drop: focus follows the card as it does for a key move. */
  const dropAt = async (task: TaskView, to: Lane, index: number) => {
    if (!(await actions.dropAt(task, to, index))) return;
    if (open.includes(to)) pending.current = { id: task.id, lane: to };
    else focusBeside(task);
  };

  const moveColumn = async (task: TaskView, direction: -1 | 1) => {
    const to = neighbour(columns, task.lane, direction);
    if (to) await moveTo(task, to);
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches(STOP)) {
      const from = target.closest<HTMLElement>("[id^='board-col-']");
      const lane = columns.find((c) => columnId(c.lane) === from?.id)?.lane;
      const plain = !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
      if (!lane || !plain || event.nativeEvent.isComposing) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      return stepColumn(lane, 0, event.key === "ArrowLeft" ? -1 : 1);
    }
    if (!target.matches(CARD)) return;
    const id = target.closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
    const at = id ? locate(columns, id) : null;
    if (!at || event.ctrlKey || event.shiftKey || event.nativeEvent.isComposing) return;
    const task = at.column.tasks[at.index] as TaskView;
    const mine = lane(task.lane);
    const handle = (run: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      run();
    };
    const key = event.key;
    if (event.metaKey && event.altKey) {
      if (key === "ArrowLeft") return handle(() => void moveColumn(task, -1));
      if (key === "ArrowRight") return handle(() => void moveColumn(task, 1));
      if (key === "ArrowUp") return handle(() => void actions.reorder(task, -1));
      if (key === "ArrowDown") return handle(() => void actions.reorder(task, 1));
      return;
    }
    if (event.metaKey) {
      if (key === "Backspace" || key === "Enter") {
        // A held key acts once: repeats would remove card after card, or start again.
        if (event.repeat) return handle(() => {});
        if (key === "Enter") return handle(() => void actions.startOn(task));
        return handle(() => {
          void actions.remove(task).then((ok) => ok && focusBeside(task));
        });
      }
      return;
    }
    if (event.altKey) return;
    if (key === "ArrowUp") return handle(() => mine[at.index - 1]?.focus());
    if (key === "ArrowDown") return handle(() => mine[at.index + 1]?.focus());
    if (key === "Home") return handle(() => mine[0]?.focus());
    if (key === "End") return handle(() => mine[mine.length - 1]?.focus());
    if (key === "ArrowLeft") return handle(() => stepColumn(task.lane, at.index, -1));
    if (key === "ArrowRight") return handle(() => stepColumn(task.lane, at.index, 1));
    if (singleKeys && key.toLowerCase() === "f") {
      return handle(() => {
        if (!event.repeat) void actions.toggleFrog(task);
      });
    }
  };

  /** Focus on a card selects it. */
  const onFocusCapture = (event: FocusEvent<HTMLElement>) => {
    // A column out of view comes into view: slowly, unless the person asked for less motion.
    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const column = (event.target as HTMLElement).closest<HTMLElement>("[id^='board-col-']");
    if (column?.closest("[data-axis='x']")) {
      column.scrollIntoView?.({ inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    }
    const id = (event.target as HTMLElement).closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
    if (id) setSelected(id);
  };

  return {
    onKeyDownCapture,
    onFocusCapture,
    selected,
    select: setSelected,
    /** Moves focus to the first card of `lane`, else its heading (a strip just opened). */
    focusColumn: (l: Lane) => {
      const heading = document.getElementById(columnId(l))?.querySelector<HTMLElement>("h2");
      heading?.setAttribute("tabindex", "-1");
      (lane(l)[0] ?? heading)?.focus(NO_SCROLL);
    },
    focusBeside,
    moveTo,
    dropAt,
  };
}
