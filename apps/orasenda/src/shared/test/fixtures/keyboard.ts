import { act } from "@testing-library/react";
import type { NavigatePage, SettingsTarget } from "../../ipc/bindings";
import { events } from "../../ipc/bindings";

export { KEYBOARD, withGlobal } from "./keyboardView";

export async function emitNavigate(
  page: NavigatePage,
  target: SettingsTarget | null = null,
): Promise<void> {
  await act(async () => {
    await events.navigate.emit({ page, target });
  });
}

export async function emitPaletteOpen(displaysOnly = false): Promise<void> {
  await act(async () => {
    await events.paletteOpen.emit({ displaysOnly });
  });
}
