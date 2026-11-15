import type { Lane } from "@shared/ipc/bindings";

export type Rect = { left: number; top: number; right: number; bottom: number };
export type Point = { x: number; y: number };

/** One column as measured at drag start. */
export type LaneRects = {
  lane: Lane;
  /** The whole column (or its strip). */
  rect: Rect;
  folded: boolean;
  /** Children before the first card in the column's list: Backlog's New task field is one. */
  lead: number;
  /** Tasks in the column; a folded strip has no card rects, so the end comes from here. */
  count: number;
  /** Every card in the list, the dragged one included, top to bottom. */
  cards: { id: string; rect: Rect }[];
};

/** How far the page region and each column's list have scrolled since the rects were measured. */
export type Scroll = { region: number; lanes: Partial<Record<Lane, number>> };

export type Target = { lane: Lane; index: number };

const inside = (rect: Rect, p: Point, dy: number) =>
  p.x >= rect.left && p.x < rect.right && p.y >= rect.top - dy && p.y < rect.bottom - dy;

/**
 * Where the pointer would drop: the lane under it and an index into that column's rendered
 * children as passed to `KanbanColumn` (the leading field counts, the dragged card is still there
 * but its midpoint never decides). Done takes a drop as a whole at its top (its order is by
 * `done_at`, not a rank), and a folded strip takes it at the end. Null outside every column.
 */
export function targetAt(
  lanes: readonly LaneRects[],
  scroll: Scroll,
  point: Point,
  draggedId: string,
): Target | null {
  const hit = lanes.find((l) => inside(l.rect, point, scroll.region));
  if (!hit) return null;
  if (hit.lane === "done") return { lane: "done", index: 0 };
  if (hit.folded) return { lane: hit.lane, index: hit.lead + hit.count };
  const shift = scroll.region + (scroll.lanes[hit.lane] ?? 0);
  const below = hit.cards.findIndex(
    (c) => c.id !== draggedId && point.y < (c.rect.top + c.rect.bottom) / 2 - shift,
  );
  return { lane: hit.lane, index: hit.lead + (below < 0 ? hit.cards.length : below) };
}

/** The `task_move` index of a target: places among the column's other cards, as `rank_at` counts. */
export function moveIndex(lanes: readonly LaneRects[], target: Target, draggedId: string): number {
  if (target.lane === "done") return 0;
  const hit = lanes.find((l) => l.lane === target.lane);
  if (!hit) return 0;
  if (hit.folded) return hit.count;
  const child = target.index - hit.lead;
  const own = hit.cards.findIndex((c) => c.id === draggedId);
  return own >= 0 && own < child ? child - 1 : child;
}

/** -1 in the top `zone` of `rect`, 1 in the bottom `zone`, else 0 (never more than half each). */
export function edgeZone(rect: Rect, point: Point, zone: number): -1 | 0 | 1 {
  if (point.x < rect.left || point.x >= rect.right) return 0;
  const reach = Math.min(zone, (rect.bottom - rect.top) / 2);
  if (point.y >= rect.top && point.y < rect.top + reach) return -1;
  if (point.y <= rect.bottom && point.y > rect.bottom - reach) return 1;
  return 0;
}
