import { App } from "@app/App";
import type { Settings, TimerView_Serialize } from "@shared/ipc/bindings";
import { argsOf, IDLE, mockBackend, type Replies, settle } from "@shared/test/fixtures";
import { fireEvent, render, screen, within } from "@testing-library/react";

export const WRITE = { kind: "write", message: "disk full" };
export const INVALID = { kind: "invalidSpec", message: "that preset isn't in the library" };
export const WRITE_REASON = "Orasenda can't write its data file.";
export const REST = "Changes save as you make them.";

export function view(patch: Partial<TimerView_Serialize>) {
  return () => ({ view: { ...IDLE, ...patch }, pending: [] });
}

/** Opens Settings (on General), then the named pane when one is given. */
export async function openSettings(replies: Replies = {}, pane?: string) {
  const backend = mockBackend(replies);
  const result = render(<App />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await settle();
  if (pane) await openPane(pane);
  return { backend, ...result };
}

/** Picks a pane in the nav with the pointer (no waiting). */
export function pick(name: string) {
  const nav = within(screen.getByRole("navigation", { name: "Settings" }));
  fireEvent.click(nav.getByRole("button", { name }));
}

export async function openPane(name: string) {
  pick(name);
  await settle();
}

export const h1 = () => screen.getByRole("heading", { level: 1, name: "Settings" });
export const statusNodes = () => screen.queryAllByRole("status");
export const saveLine = () => statusNodes()[0] as HTMLElement;
export const sets = (backend: { calls: { cmd: string; args: unknown }[] }) =>
  argsOf(backend.calls, "settings_set") as { settings: Settings }[];
