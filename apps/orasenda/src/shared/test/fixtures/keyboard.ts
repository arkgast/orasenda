import { act } from "@testing-library/react";
import type { FocusInsets, NavigatePage, SettingsTarget } from "../../ipc/bindings";
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

export async function emitFocusInsets(insets: Partial<FocusInsets> = {}): Promise<void> {
  await act(async () => {
    await events.focusInsets.emit({ top: 0, right: 0, bottom: 0, left: 0, ...insets });
  });
}

export async function emitPaletteOpen(displaysOnly = false): Promise<void> {
  await act(async () => {
    await events.paletteOpen.emit({ displaysOnly });
  });
}
