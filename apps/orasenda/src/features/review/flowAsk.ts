import type { Flow } from "./Overview";

/** A request, from outside the Review page, to open a flow. `seq` only goes up. */
export type FlowAsk = { seq: number; flow: Flow };

/**
 * The last `seq` the Review page acted on. It outlives the page, so a remount with the ask it
 * already opened (coming back to Review later) never opens the flow again; the same shape as
 * `importAsk.ts`.
 */
let consumed = 0;

/** The flow to open, once per new ask; null for no ask or one already used. */
export function takeFlowAsk(ask: FlowAsk | undefined): Flow | null {
  if (!ask || ask.seq === consumed) return null;
  consumed = ask.seq;
  return ask.flow;
}

/** Tests start from a clean slate. */
export function resetFlowAsk(): void {
  consumed = 0;
}
