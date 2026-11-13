import type { FocusViewTarget } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";

/**
 * Opens a focus view; resolves to whether it opened. Failures are logged here. The floater goes
 * through `action_run`, the one entry point menus and global shortcuts use, so a repeat press is
 * dropped there; the command answers once the work is handed on, and Rust logs a failure.
 */
export async function openFocusView(target: FocusViewTarget): Promise<boolean> {
  try {
    if (target.kind === "floater") {
      await commands.actionRun("floater");
      return true;
    }
    const result = await commands.focusViewOpen(target);
    if (result.status === "ok") return true;
    console.error("focus_view_open failed", result.error);
  } catch (error) {
    console.error("focus_view_open failed", error);
  }
  return false;
}
