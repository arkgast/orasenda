import type { FocusViewTarget } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";

/** Opens a focus view; resolves to whether it opened. Failures are logged here. */
export async function openFocusView(target: FocusViewTarget): Promise<boolean> {
  try {
    const result = await commands.focusViewOpen(target);
    if (result.status === "ok") return true;
    console.error("focus_view_open failed", result.error);
  } catch (error) {
    console.error("focus_view_open failed", error);
  }
  return false;
}
