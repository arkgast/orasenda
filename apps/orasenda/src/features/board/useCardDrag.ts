import type { ColumnView, Lane, TaskView } from "@shared/ipc/bindings";
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { moveIndex, type Point, type Target, targetAt } from "./dragGeometry";
import { edgeScroller, type Measured, measureBoard, scrollSince } from "./dragMeasure";
import { locate } from "./lanes";
import { px } from "./useRoom";

/**
 * How far the pointer must travel before a press becomes a drag. A behaviour constant, not a
 * style: below it the press stays a click (select or open).
 */
export const DRAG_START_PX = 6;

/** How far an edge zone scrolls a list on each animation frame; also behaviour, not style. */
const EDGE_STEP_PX = 12;

const CARD = 'button[data-slot="task-card"]';

export type DragView = {
  id: string;
  /** Where the slot goes; null at the card's own place or outside every column. */
  drop: { lane: Lane; index: number; label: string } | null;
};

type Args = {
  root: RefObject<HTMLElement | null>;
  columns: readonly ColumnView[];
  /** False while the task sheet or the import sheet is open. */
  enabled: boolean;
  name(lane: Lane): string;
  /** Says a line through the Board's status line. */
  say(text: string): void;
  drop(task: TaskView, lane: Lane, index: number): void;
};

type Armed = { id: string; x: number; y: number; button: HTMLElement; pointerId: number };

/**
 * Mouse and pen drag of a card (spec "Drag"). Pointer events only, from a press on a card's button
 * on the board root; the rest is listened for on the window while a press or drag is live. The
 * card stays in place marked Moving; rects are measured once, after that render, and the target
 * is recomputed on move, scroll and wheel against them plus the scroll offsets.
 */
export function useCardDrag({ root, columns, enabled, name, say, drop }: Args) {
  const [view, setView] = useState<DragView | null>(null);
  const latest = useRef({ columns, name, say, drop });
  latest.current = { columns, name, say, drop };
  const armed = useRef<Armed | null>(null);
  const live = useRef<{ id: string; lane: Lane; title: string } | null>(null);
  const measured = useRef<Measured | null>(null);
  const point = useRef<Point>({ x: 0, y: 0 });
  const shown = useRef("");
  const frame = useRef(0);
  const stop = useRef<(() => void) | null>(null);

  /** Where a release now would drop, or null on the card's own place or outside every column. */
  const resolve = (): (Target & { move: number }) | null => {
    const m = measured.current;
    const d = live.current;
    if (!m || !d) return null;
    const target = targetAt(m.lanes, scrollSince(m), point.current, d.id);
    if (!target) return null;
    if (target.lane === "done" && d.lane === "done") return null;
    if (target.lane === d.lane) {
      const mine = m.lanes.find((l) => l.lane === d.lane);
      const at = mine?.cards.findIndex((c) => c.id === d.id) ?? -1;
      const child = (mine?.lead ?? 0) + at;
      // The slot right above or below the card itself is its own place.
      if (at >= 0 && (target.index === child || target.index === child + 1)) return null;
    }
    return { ...target, move: moveIndex(m.lanes, target, d.id) };
  };

  const refresh = () => {
    const d = live.current;
    if (!d) return;
    const t = resolve();
    const key = t ? `${t.lane}:${t.index}` : "";
    if (key === shown.current) return;
    shown.current = key;
    setView({
      id: d.id,
      drop: t ? { lane: t.lane, index: t.index, label: `Moving ${d.title} here` } : null,
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `refresh` only reads refs and a setter.
  const edge = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const m = measured.current;
    const zone = px("--hit-min");
    if (!live.current || !m || !zone) return;
    const found = edgeScroller(m, point.current, zone);
    if (!found) return;
    const tick = () => {
      const again = measured.current && edgeScroller(measured.current, point.current, zone);
      if (!live.current || !again) return;
      again.el.scrollTop += again.dir * EDGE_STEP_PX;
      refresh();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  const finish = (commit: boolean) => {
    const d = live.current;
    const was = armed.current;
    const t = commit ? resolve() : null;
    stop.current?.();
    stop.current = null;
    cancelAnimationFrame(frame.current);
    try {
      was?.button.releasePointerCapture?.(was.pointerId);
    } catch {
      // The browser already let go of the pointer.
    }
    armed.current = null;
    live.current = null;
    measured.current = null;
    shown.current = "";
    if (!d) return;
    // The click (and double click) that ends a real drag is not a select or an open.
    const swallow = (event: Event) => {
      event.stopPropagation();
      event.preventDefault();
    };
    window.addEventListener("click", swallow, true);
    window.addEventListener("dblclick", swallow, true);
    setTimeout(() => {
      window.removeEventListener("click", swallow, true);
      window.removeEventListener("dblclick", swallow, true);
    }, 0);
    setView(null);
    const task = locate(latest.current.columns, d.id)?.column.tasks.find((x) => x.id === d.id);
    if (t && task) return latest.current.drop(task, t.lane, t.move);
    latest.current.say(`${d.title} stayed in ${latest.current.name(d.lane)}.`);
    root.current
      ?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(d.id)}"] ${CARD}`)
      ?.focus();
  };

  const listen = () => {
    const onMove = (event: PointerEvent) => {
      const a = armed.current;
      if (!a || event.pointerId !== a.pointerId) return;
      point.current = { x: event.clientX, y: event.clientY };
      if (!live.current) {
        if (Math.hypot(event.clientX - a.x, event.clientY - a.y) < DRAG_START_PX) return;
        const found = locate(latest.current.columns, a.id);
        if (!found) return finish(false);
        const title = found.column.tasks[found.index]?.title ?? "";
        live.current = { id: a.id, lane: found.column.lane, title };
        try {
          a.button.setPointerCapture?.(a.pointerId);
        } catch {
          // A pointer that is already gone cannot be captured; the window listeners carry on.
        }
        latest.current.say(`Moving ${title}. Esc puts it back.`);
        setView({ id: a.id, drop: null });
        return;
      }
      refresh();
      edge();
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== armed.current?.pointerId) return;
      point.current = { x: event.clientX, y: event.clientY };
      finish(true);
    };
    const onCancel = () => finish(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !live.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(false);
    };
    const onScroll = () => {
      refresh();
      edge();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("wheel", onScroll, { passive: true });
    stop.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onScroll);
    };
  };

  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || armed.current || event.button !== 0) return;
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const button = (event.target as Element).closest<HTMLElement>(CARD);
    const id = button?.closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
    if (!button || !id) return;
    armed.current = { id, x: event.clientX, y: event.clientY, button, pointerId: event.pointerId };
    point.current = { x: event.clientX, y: event.clientY };
    listen();
  };

  // After the render that marked the card Moving: measure once, then place the first slot.
  const dragging = view?.id ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure once per drag, not per move.
  useLayoutEffect(() => {
    if (!dragging || measured.current || !root.current) return;
    measured.current = measureBoard(root.current, latest.current.columns);
    refresh();
    edge();
  }, [dragging]);

  // A sheet opening, or the board going away, ends a drag.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `finish` only reads refs; it runs when `enabled` flips.
  useEffect(() => {
    if (!enabled && armed.current) finish(false);
  }, [enabled]);
  useEffect(
    () => () => {
      stop.current?.();
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  return { pointerDown, drag: view };
}
