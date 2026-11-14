import type { Handler } from "./backend";
import { backend, IDLE, RUNNING, WINDOWED } from "./backend";
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
  // `main` in native full screen (H4b). The hint count is 0 where a spec measures the layout, so
  // nothing fades under it; `fullScreenHint` is the first entry, with its hint showing.
  fullScreenRunning: backend({
    view: RUNNING,
    replies: { window_view: () => ({ ...WINDOWED, fullScreen: true, hintsLeft: 0 }) },
  }),
  fullScreenIdle: backend({
    view: IDLE,
    replies: { window_view: () => ({ ...WINDOWED, fullScreen: true, hintsLeft: 0 }) },
  }),
  fullScreenHint: backend({
    view: RUNNING,
    replies: { window_view: () => ({ ...WINDOWED, fullScreen: true, hintsLeft: 3 }) },
  }),
  leaveError: backend({
    view: RUNNING,
    replies: {
      window_view: () => ({ ...WINDOWED, fullScreen: true, hintsLeft: 0 }),
      full_screen_leave: rejects("failed", "no"),
    },
  }),
};
