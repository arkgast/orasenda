import { priorityView, reviewView } from "@shared/test/fixtures/review";
import type { Handler } from "./backend";
import { backend } from "./backend";

export const REVIEW_SCENARIOS: Record<string, Handler> = {};

// The Review overview: a planned week with three priorities, one of them done and one with a long
// title (reviewOverview); a week with no priorities yet (reviewEmpty); and a store that cannot be
// read (reviewUnavailable).
const reviewBackend = (read: () => unknown): Handler => backend({ replies: { review_get: read } });

REVIEW_SCENARIOS.reviewOverview = reviewBackend(() =>
  reviewView({
    week: {
      ...reviewView().week,
      line: "Three priorities so far.",
      priorities: [
        priorityView({ taskId: "a", title: "Fix sync bug", line: "Fix sync bug · Doing" }),
        priorityView({
          taskId: "b",
          title: "Write notes",
          done: true,
          line: "Write notes · Done",
        }),
        priorityView({
          taskId: "c",
          title: "Plan the quarterly roadmap with every team that depends on the sync service",
          line: "Plan the quarterly roadmap with every team that depends on the sync service · Backlog",
        }),
      ],
    },
  }),
);

REVIEW_SCENARIOS.reviewEmpty = reviewBackend(() =>
  reviewView({ week: { ...reviewView().week, line: "No priorities yet.", priorities: [] } }),
);

REVIEW_SCENARIOS.reviewUnavailable = reviewBackend(() => Promise.reject("store"));
