import type { ShutdownView_Serialize } from "@shared/ipc/bindings";
import { mockBackend, type Replies, settle, shutdownView } from "@shared/test/fixtures";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ShutdownFlow } from "./ShutdownFlow";

/** Two tasks to look at: one idle in Doing, one with a running session. */
export const TWO = shutdownView({
  unfinished: [
    { id: "task-2", title: "Write notes", laneLabel: "Doing", active: false },
    { id: "task-3", title: "Fix sync bug", laneLabel: "Today", active: true },
    { id: "task-4", title: "Call the bank", laneLabel: "Today", active: false },
  ],
});

/** Renders the shutdown flow on the mocked backend and lets the first view land. */
export async function openShutdown(replies: Replies = {}, view: ShutdownView_Serialize = TWO) {
  const onClose = vi.fn();
  const backend = mockBackend({
    shutdown_get: () => view,
    shutdown_move: () => ({ token: "t1", line: "Moved 2 tasks to Backlog." }),
    shutdown_move_undo: () => "Put 2 tasks back.",
    shutdown_complete: () => ({ ...view, completedLine: "Shutdown complete." }),
    ...replies,
  });
  const result = render(<ShutdownFlow onClose={onClose} />);
  await settle();
  return { backend, onClose, ...result };
}

/** Presses the button the way a keyboard does: focus, then Return. */
export async function press(name: string | RegExp): Promise<void> {
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
  await settle();
}

export const heading = () => screen.getByRole("heading", { level: 1 });

/** The one polite region the flow owns. */
export const live = () => document.querySelector('[data-slot="flow-live"]');

export async function pressKey(key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
  });
}
