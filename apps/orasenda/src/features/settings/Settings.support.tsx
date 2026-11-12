import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "../../app/App";
import type { Settings, TimerView_Serialize } from "../../ipc/bindings";
import { argsOf, IDLE, mockBackend, type Replies, settle } from "../../test/fixtures";

export const WRITE = { kind: "write", message: "disk full" };
export const INVALID = { kind: "invalidSpec", message: "that preset isn't in the library" };
export const WRITE_REASON = "Orasenda can't write its data file.";
export const REST = "Changes save as you make them.";

export function view(patch: Partial<TimerView_Serialize>) {
  return () => ({ view: { ...IDLE, ...patch }, pending: [] });
}

export async function openSettings(replies: Replies = {}) {
  const backend = mockBackend(replies);
  const result = render(<App />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await settle();
  return { backend, ...result };
}

export const h1 = () => screen.getByRole("heading", { level: 1, name: "Settings" });
export const statusNodes = () => screen.queryAllByRole("status");
export const saveLine = () => statusNodes()[0] as HTMLElement;
export const sets = (backend: { calls: { cmd: string; args: unknown }[] }) =>
  argsOf(backend.calls, "settings_set") as { settings: Settings }[];
