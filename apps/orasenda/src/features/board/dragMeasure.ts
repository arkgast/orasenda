import type { ColumnView, Lane } from "@shared/ipc/bindings";
import {
  edgeZone,
  edgeZoneX,
  type LaneRects,
  type Point,
  type Rect,
  type Scroll,
} from "./dragGeometry";
import { columnId } from "./lanes";
import { NEW_TASK_ID } from "./NewTaskField";

/** A px token (`--hit-min`) as a number, or null when the token CSS is not loaded. */
export function px(name: string): number | null {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(value) ? value : null;
}

/** The board as it stood at drag start: rects, plus the scrollers whose offsets move them. */
export type Measured = {
  lanes: LaneRects[];
  /** Each open column's scrolling list. */
  lists: Record<Lane, HTMLElement>;
  /** The page's ScrollRegion: sideways in a regular window, down in a compact one. */
  region: HTMLElement | null;
  /** Scroll offsets at the time of measuring. */
  start: { region: number; x: number; lanes: Partial<Record<Lane, number>> };
};

const rectOf = (el: Element): Rect => {
  const { left, top, right, bottom } = el.getBoundingClientRect();
  return { left, top, right, bottom };
};

/** Measures the board; call it after the render that marked the card Moving. */
export function measureBoard(root: HTMLElement, columns: readonly ColumnView[]): Measured {
  const lanes: LaneRects[] = [];
  const lists: Record<Lane, HTMLElement> = {};
  const startLanes: Partial<Record<Lane, number>> = {};
  const region = root.closest<HTMLElement>('[data-slot="scroll-region"]');
  for (const column of columns) {
    const el = root.querySelector<HTMLElement>(`#${columnId(column.lane)}`);
    if (!el) continue;
    const folded = el.matches('[data-slot="kanban-column-strip"]');
    const list = folded ? null : el.querySelector<HTMLElement>('[data-slot="kanban-column-cards"]');
    const cards = list
      ? [...list.querySelectorAll<HTMLElement>(":scope > [data-task-id]")].map((card) => ({
          id: card.dataset.taskId ?? "",
          rect: rectOf(card),
        }))
      : [];
    if (list) {
      lists[column.lane] = list;
      startLanes[column.lane] = list.scrollTop;
    }
    lanes.push({
      lane: column.lane,
      rect: rectOf(el),
      folded,
      lead: list?.querySelector(`#${NEW_TASK_ID}`) ? 1 : 0,
      count: column.tasks.length,
      cards,
    });
  }
  return {
    lanes,
    lists,
    region,
    start: { region: region?.scrollTop ?? 0, x: region?.scrollLeft ?? 0, lanes: startLanes },
  };
}

/** How far each scroller has moved since the measure (a list or the page scrolls up, rects go up). */
export function scrollSince(m: Measured): Scroll {
  const lanes: Partial<Record<Lane, number>> = {};
  for (const [lane, list] of Object.entries(m.lists) as [Lane, HTMLElement][]) {
    lanes[lane] = list.scrollTop - (m.start.lanes[lane] ?? 0);
  }
  return {
    region: (m.region?.scrollTop ?? 0) - m.start.region,
    x: (m.region?.scrollLeft ?? 0) - m.start.x,
    lanes,
  };
}

const sideways = (el: HTMLElement) => el.dataset.axis === "x";

const canScroll = (el: HTMLElement, dir: -1 | 1) =>
  sideways(el)
    ? dir < 0
      ? el.scrollLeft > 0
      : el.scrollLeft + el.clientWidth < el.scrollWidth
    : dir < 0
      ? el.scrollTop > 0
      : el.scrollTop + el.clientHeight < el.scrollHeight;

/** The scroller whose edge zone holds the pointer, and the way to scroll it (sideways for the Board's region). */
export function edgeScroller(
  m: Measured,
  point: Point,
  zone: { list: number; strip: number },
): { el: HTMLElement; dir: -1 | 1; x: boolean } | null {
  const candidates = [...Object.values(m.lists), ...(m.region ? [m.region] : [])];
  for (const el of candidates) {
    const x = sideways(el);
    const dir = (x ? edgeZoneX : edgeZone)(rectOf(el), point, x ? zone.strip : zone.list);
    if (dir !== 0 && canScroll(el, dir)) return { el, dir, x };
  }
  return null;
}
