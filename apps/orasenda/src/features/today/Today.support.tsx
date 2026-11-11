import { render, screen } from "@testing-library/react";
import type { Settings } from "../../ipc/bindings";
import { mockBackend, type Replies, SETTINGS, settle } from "../../test/fixtures";
import { Today } from "./Today";

export const RANGE_HELP = "Between 5 and 180 minutes.";
export const INVALID_SPEC = { kind: "invalidSpec", message: "focus_min out of range" };

export async function renderToday(replies: Replies = {}) {
  const backend = mockBackend(replies);
  const view = render(<Today />);
  await settle();
  return { backend, ...view };
}

export function savedSettings(settings: Partial<Settings>): Replies {
  return { settings_get: () => ({ ...SETTINGS, ...settings }) };
}

/** Elements with exactly `text`, outside the ring (whose centre repeats the chip, hidden). */
export function outsideRing(text: string): HTMLElement[] {
  return screen
    .queryAllByText(text)
    .filter((element) => element.closest('[role="timer"]') === null);
}

export function statusNodes(): HTMLElement[] {
  return screen.queryAllByRole("status");
}
