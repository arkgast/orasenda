import { withGlobal } from "@shared/test/fixtures/keyboardView";
import type { Handler } from "./backend";
import { backend, KEYBOARD, SETTINGS } from "./backend";

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
  keyboardSingleOff: backend({ settings: { ...SETTINGS, singleKey: false } }),
};
