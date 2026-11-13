import type {
  ActionId,
  ActionView_Serialize,
  Group,
  KeyboardView_Serialize,
} from "../../ipc/bindings";

type Binding = { keys: string | null; display: string | null; spoken: string | null };

const NONE: Binding = { keys: null, display: null, spoken: null };

const binding = (keys: string, display: string, spoken: string): Binding => ({
  keys,
  display,
  spoken,
});

type Defaults = { app: Binding; global: Binding; single?: string };

const action = (
  id: ActionId,
  label: string,
  description: string,
  group: Group,
  { app, global, single }: Defaults,
  custom = false,
): ActionView_Serialize => ({
  id,
  label,
  description,
  group,
  app: { ...app, isDefault: true, repaired: false },
  global: {
    ...global,
    isDefault: !custom,
    repaired: false,
    status: global.keys ? "registered" : "off",
  },
  singleKey: single ?? null,
});

const fixed = (label: string, keys: string, display: string, spoken: string) => ({
  label,
  keys,
  display,
  spoken,
});

/**
 * The registry as `keyboard_state` answers it. Start or pause and capture keep their pre-H3
 * *Everywhere* keys (⌃⌥F, ⌃⌥N), a valid saved choice, so the two Settings rows read as they did.
 */
export const KEYBOARD: KeyboardView_Serialize = {
  actions: [
    action(
      "fullScreen",
      "Full screen on this display",
      "Fills this display with the timer.",
      "fullScreen",
      {
        app: binding("Super+KeyF", "⌘F", "Command-F"),
        global: binding("Control+Alt+Super+KeyF", "⌃⌥⌘F", "Control-Option-Command-F"),
      },
    ),
    action(
      "fullScreenOther",
      "Full screen on another display",
      "Fills another display with the timer.",
      "fullScreen",
      {
        app: binding("Shift+Super+KeyF", "⇧⌘F", "Shift-Command-F"),
        global: binding("Control+Alt+Shift+Super+KeyF", "⌃⌥⇧⌘F", "Control-Option-Shift-Command-F"),
      },
    ),
    action("leaveFullScreen", "Leave full screen", "Goes back to the window.", "fullScreen", {
      app: NONE,
      global: NONE,
    }),
    action(
      "floater",
      "Floating timer, there and back",
      "Opens the small timer, or brings the window back.",
      "timer",
      {
        app: binding("Shift+Super+KeyT", "⇧⌘T", "Shift-Command-T"),
        global: binding("Control+Alt+Super+KeyT", "⌃⌥⌘T", "Control-Option-Command-T"),
      },
    ),
    action(
      "startPause",
      "Start or pause focus",
      "Starts a focus session, or pauses the one that is running.",
      "timer",
      {
        app: NONE,
        global: binding("Control+Alt+KeyF", "⌃⌥F", "Control-Option-F"),
        single: "Space",
      },
      true,
    ),
    action(
      "capture",
      "Capture a thought",
      "Opens a small box to jot a thought down.",
      "capture",
      { app: NONE, global: binding("Control+Alt+KeyN", "⌃⌥N", "Control-Option-N") },
      true,
    ),
  ],
  fixed: [
    fixed("Commands", "Super+KeyK", "⌘K", "Command-K"),
    fixed("Settings", "Super+Comma", "⌘,", "Command-Comma"),
    fixed("Start focus", "Super+Enter", "⌘↩", "Command-Return"),
    fixed("Just 2 minutes", "Shift+Super+Enter", "⇧⌘↩", "Shift-Command-Return"),
    fixed("End session", "Super+Period", "⌘.", "Command-Period"),
    ...["Today", "Board", "Calendar", "Routines", "Review", "Settings"].map((label, i) =>
      fixed(label, `Super+Digit${i + 1}`, `⌘${i + 1}`, `Command-${i + 1}`),
    ),
    fixed("Leave full screen", "Escape", "Esc", "Escape"),
    fixed("Quit Orasenda", "Super+KeyQ", "⌘Q", "Command-Q"),
    fixed("Copy", "Super+KeyC", "⌘C", "Command-C"),
  ],
  singleKey: true,
  voiceOver: false,
};

/** `view` with the *Everywhere* binding of `id` changed (a status, or other keys). */
export function withGlobal(
  view: KeyboardView_Serialize,
  id: ActionId,
  patch: Partial<ActionView_Serialize["global"]>,
): KeyboardView_Serialize {
  return {
    ...view,
    actions: view.actions.map((a) =>
      a.id === id ? { ...a, global: { ...a.global, ...patch } } : a,
    ),
  };
}
