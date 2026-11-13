import { act } from "@testing-library/react";
import type {
  FocusInsets,
  KeyboardView_Serialize,
  NavigatePage,
  SettingsTarget,
} from "../../ipc/bindings";
import { events } from "../../ipc/bindings";

/** Both global shortcuts at their defaults, as `keyboard_state` answers on a fresh install. */
export const KEYBOARD: KeyboardView_Serialize = {
  startPause: {
    keys: "Control+Alt+KeyF",
    display: "⌃⌥F",
    spoken: "Control-Option-F",
    status: "registered",
  },
  capture: {
    keys: "Control+Alt+KeyN",
    display: "⌃⌥N",
    spoken: "Control-Option-N",
    status: "registered",
  },
  singleKey: true,
  voiceOver: false,
};

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

export async function emitPaletteOpen(): Promise<void> {
  await act(async () => {
    await events.paletteOpen.emit();
  });
}
