import { withGlobal } from "@shared/test/fixtures/keyboardView";
import type { Handler } from "./backend";
import { backend, KEYBOARD, SETTINGS } from "./backend";

/** The registry's own defaults (`registry.rs`), as a fresh install shows them. */
const FRESH = withGlobal(
  withGlobal(KEYBOARD, "startPause", {
    isDefault: true,
    keys: "Control+Alt+Super+Space",
    display: "⌃⌥⌘Space",
    spoken: "Control-Option-Command-Space",
  }),
  "capture",
  {
    isDefault: true,
    keys: "Control+Alt+Super+KeyN",
    display: "⌃⌥⌘N",
    spoken: "Control-Option-Command-N",
  },
);

export const KEYBOARD_SCENARIOS: Record<string, Handler> = {
  // Settings › Keyboard: the longest lines (another app holds the shortcut, VoiceOver is on) and single keys off.
  keyboardLongest: backend({
    replies: {
      keyboard_state: () => ({
        ...withGlobal(KEYBOARD, "startPause", { status: "failed" }),
        voiceOver: true,
      }),
    },
  }),
  // Fresh defaults with VoiceOver on: the longest VoiceOver line on both rows.
  keyboardFresh: backend({
    replies: { keyboard_state: () => ({ ...FRESH, voiceOver: true }) },
  }),
  // Any change to a binding asks the Warning question first.
  keyboardWarning: backend({
    replies: {
      keyboard_set_binding: () =>
        Promise.reject({ warning: { reason: "Other apps often use this key." } }),
    },
  }),
  // A repaired app binding (the conflict line) and a global binding that is off.
  keyboardRepaired: backend({
    replies: {
      keyboard_state: () => {
        const view = withGlobal(KEYBOARD, "startPause", {
          keys: null,
          display: null,
          spoken: null,
        });
        return {
          ...view,
          actions: view.actions.map((a) =>
            a.id === "startPause" ? { ...a, app: { ...a.app, repaired: true } } : a,
          ),
        };
      },
    },
  }),
  keyboardSingleOff: backend({ settings: { ...SETTINGS, singleKey: false } }),
};
