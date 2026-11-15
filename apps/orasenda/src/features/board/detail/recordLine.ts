import type { TaskView } from "@shared/ipc/bindings";

/** "Estimate 3 · 4 with buffer · Actual 4 sessions, 1h 40m"; "No estimate" when there is none. */
export function recordLine(task: TaskView): string {
  const plan = task.estimate
    ? [`Estimate ${task.estimate}`, ...(task.planned ? [`${task.planned} with buffer`] : [])]
    : ["No estimate"];
  const actual = `Actual ${task.sessions} ${task.sessions === 1 ? "session" : "sessions"}, ${task.tracked}`;
  return [...plan, actual].join(" · ");
}
