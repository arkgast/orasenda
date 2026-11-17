import { reviewView, shutdownView } from "@shared/test/fixtures/review";
import type { Handler } from "./backend";
import { backend } from "./backend";

export const REVIEW_SHUTDOWN_SCENARIOS: Record<string, Handler> = {};

const LONG =
  "Plan the quarterly roadmap with every team that depends on the sync service and write it up";

// The shutdown flow, each step: three unfinished tasks (one with a running session, one with a long
// title) and a long tomorrow list (reviewShutdown); and a day with nothing unfinished or planned
// (reviewShutdownEmpty). Moves and the save answer as Rust does, so every step can be walked.
const shutdownBackend = (view: ReturnType<typeof shutdownView>): Handler =>
  backend({
    replies: {
      review_get: () => reviewView(),
      shutdown_get: () => view,
      shutdown_move: () => ({ token: "layout-token", line: "Moved 2 tasks to Backlog." }),
      shutdown_move_undo: () => "Put 2 tasks back.",
      shutdown_complete: () => ({ ...view, completedLine: "Shutdown complete." }),
    },
  });

REVIEW_SHUTDOWN_SCENARIOS.reviewShutdown = shutdownBackend(
  shutdownView({
    unfinished: [
      { id: "a", title: "Write notes", laneLabel: "Doing", active: false },
      { id: "b", title: "Fix sync bug", laneLabel: "Doing", active: true },
      { id: "c", title: LONG, laneLabel: "Today", active: false },
      { id: "d", title: "Call the bank", laneLabel: "Today", active: false },
      { id: "e", title: "Reply to Sam", laneLabel: "Today", active: false },
    ],
    tomorrow: [
      "Tuesday 17 November.",
      "Routines: Morning Light & Movement at 07:30, Wind-down at 21:00, Stretch (any time).",
      "Due: Send the invoice.",
      "Planned: 3 sessions of 25 minutes, with a 40% buffer.",
      `Priorities: Fix sync bug, ${LONG}.`,
    ],
  }),
);

REVIEW_SHUTDOWN_SCENARIOS.reviewShutdownEmpty = shutdownBackend(
  shutdownView({ unfinished: [], tomorrow: ["Saturday 21 November. Nothing planned."] }),
);
