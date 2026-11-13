import {
  Choice,
  describeShortcut,
  SettingsRow,
  ShortcutList,
  type ShortcutListItem,
  ShortcutRecorder,
} from "@orasenda/ui";
import type { KeyboardError, KeyboardView, ShortcutId } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { useRef } from "react";
import { SHORTCUT_NAME, useKeyboard } from "../useKeyboard";

const ANOTHER_APP = "Another app uses this shortcut. Pick a different one.";
const ERROR_LINE: Record<KeyboardError, string> = {
  unavailable: ANOTHER_APP,
  inUseByOrasenda: "Orasenda already uses this shortcut. Pick a different one.",
  invalid: "That isn't a shortcut Orasenda can use. Pick a different one.",
  store: "Orasenda can't save this shortcut right now.",
};
const VOICE_OVER = "VoiceOver uses Control-Option keys. You may want a different shortcut.";
const SINGLE_KEY_HELP =
  "Space, F and P on Today, Space in Focus view. Shortcuts with ⌘ always work.";

// Built from its code point: the copy guard reads the return arrow as an emoji.
const RETURN = String.fromCharCode(0x21a9);

type Entry = { action: string; keys: string; single?: boolean };
const ENTRIES: Entry[] = [
  { action: "Start focus", keys: `⌘${RETURN}` },
  { action: "Just 2 minutes", keys: `⇧⌘${RETURN}` },
  { action: "End session", keys: "⌘." },
  { action: "Full screen", keys: "⇧⌘F" },
  { action: "Floating timer", keys: "⇧⌘T" },
  { action: "Commands", keys: "⌘K" },
  { action: "Settings", keys: "⌘," },
  { action: "On Today", keys: "Space F P", single: true },
  { action: "In Focus view", keys: "Space", single: true },
];

/** The All shortcuts items; the single keys are marked off while single-key shortcuts are off. */
export function shortcutItems(singleKey: boolean): ShortcutListItem[] {
  return ENTRIES.map(({ action, keys, single }) => ({
    action,
    keys,
    spokenKeys: keys
      .split(" ")
      .map((key) => describeShortcut(key).spoken)
      .join(", "),
    off: single && !singleKey ? true : undefined,
  }));
}

function lineFor(
  id: ShortcutId,
  view: KeyboardView,
  error: KeyboardError | null,
): string | undefined {
  if (error) return ERROR_LINE[error];
  if (view[id].status === "failed") return ANOTHER_APP;
  const parts = view[id].keys?.split("+") ?? [];
  return view.voiceOver && parts.includes("Control") && parts.includes("Alt")
    ? VOICE_OVER
    : undefined;
}

type Props = {
  singleKey: boolean;
  disabled: boolean;
  disabledReason?: string;
  status?: string;
  onSingleKey: (checked: boolean) => void;
  /** The save line ("Start or pause focus: ⌃⌥G."). */
  onSaved: (text: string) => void;
};

export function Keyboard({
  singleKey,
  disabled,
  disabledReason,
  status,
  onSingleKey,
  onSaved,
}: Props) {
  const keyboard = useKeyboard(onSaved);
  const { view } = keyboard;
  // Shortcuts are suspended while a recorder listens. A record waits for the `off` that precedes it, so
  // the suspension is over before the change registers.
  const suspension = useRef<Promise<unknown>>(Promise.resolve());
  function suspend(on: boolean) {
    suspension.current = suspension.current
      .then(() => commands.keyboardRecording(on))
      .catch((error: unknown) => {
        console.error("keyboard recording failed", error);
      });
  }
  return (
    <section id="settings-keyboard" aria-labelledby="settings-keyboard-heading">
      <h2 id="settings-keyboard-heading" tabIndex={-1} className="settings-heading">
        Keyboard
      </h2>
      {view ? (
        (["startPause", "capture"] as const).map((id) => (
          <SettingsRow
            key={id}
            id={`keyboard-${id}`}
            label={SHORTCUT_NAME[id]}
            helper="Works while another app is in front."
            disabledReason={disabledReason}
          >
            <ShortcutRecorder
              id={`keyboard-${id}-field`}
              label={`${SHORTCUT_NAME[id]} from anywhere`}
              keys={view[id].display ?? undefined}
              spokenKeys={view[id].spoken ?? undefined}
              conflict={lineFor(id, view, keyboard.errors[id])}
              onRecordingChange={suspend}
              onRecord={(glyphs) => void suspension.current.then(() => keyboard.set(id, glyphs))}
              onRestoreDefault={() => keyboard.restore(id)}
            />
          </SettingsRow>
        ))
      ) : keyboard.loadFailed ? (
        <p className="app-muted">Orasenda can't read keyboard settings right now.</p>
      ) : null}
      <SettingsRow
        id="keyboard-single"
        label="Single-key shortcuts"
        helper={SINGLE_KEY_HELP}
        status={status}
        disabledReason={disabledReason}
      >
        <Choice
          type="checkbox"
          checked={singleKey}
          disabled={disabled}
          aria-describedby="keyboard-single-help"
          onChange={(event) => onSingleKey(event.target.checked)}
        >
          Use single keys (Space, F, P)
        </Choice>
      </SettingsRow>
      <div className="flex flex-col gap-2 py-4">
        <p className="m-0 font-semibold">All shortcuts</p>
        <ShortcutList items={shortcutItems(singleKey)} />
      </div>
    </section>
  );
}
