import { act } from "@testing-library/react";
import type { WindowView_Serialize } from "../../ipc/bindings";
import { events } from "../../ipc/bindings";
import type { Replies } from "./index";

/** `main` in a window, on the first display, with all three entries' hints left. */
export const WINDOWED: WindowView_Serialize = { fullScreen: false, display: "1", hintsLeft: 3 };

/** `main` in full screen on the first display; `hintsLeft` is the count at this entry's start. */
export const fullScreenView = (hintsLeft = 3): WindowView_Serialize => ({
  fullScreen: true,
  display: "1",
  hintsLeft,
});

/** The replies of the four full-screen commands (H4a). */
export const FULL_SCREEN_REPLIES: Replies = {
  window_view: () => WINDOWED,
  full_screen_enter: () => null,
  full_screen_enter_on: () => null,
  full_screen_leave: () => null,
};

export async function emitWindowView(view: WindowView_Serialize): Promise<void> {
  await act(async () => {
    await events.windowView.emit(view);
  });
}
