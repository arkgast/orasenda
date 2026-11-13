import type { Handler } from "./backend";
import { backend, RUNNING } from "./backend";
import { rejects } from "./timer";
import { DEEP_RUNNING } from "./today";

export const FOCUS: Record<string, Handler> = {
  // Focus window and floater: the longest running case, and the failures their status lines show.
  deepRunning: backend({ view: DEEP_RUNNING }),
  viewUnreadable: backend({ replies: { timer_view: rejects("store", "no timer") } }),
  presetSelectError: backend({ replies: { preset_select: rejects("store", "disk full") } }),
  // The capture panel: a save that fails (the text stays), and one that never answers.
  captureError: backend({ replies: { capture_note: rejects("store", "disk full") } }),
  captureSaving: backend({ replies: { capture_note: () => new Promise(() => {}) } }),
  closeError: backend({
    view: RUNNING,
    replies: { focus_view_close: rejects("unavailable", "no window") },
  }),
};
