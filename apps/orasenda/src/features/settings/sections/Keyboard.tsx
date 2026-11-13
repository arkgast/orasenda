import { bindingLine, SLOT_NAME } from "@domain/keyboard/bindings";
import { KEY } from "@domain/keyboard/glyphs";
import { Choice, SettingsRow, ShortcutList, ShortcutRecorder } from "@orasenda/ui";
import type { ActionView, KeyboardView, Slot } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { useRef } from "react";
import { shortcutItems } from "../shortcutItems";
import { SHORTCUT_ROWS, type ShortcutId, useKeyboard } from "../useKeyboard";

const SINGLE_KEY_HELP = `Space, F and P on Today, Space in Focus view. Shortcuts with ${KEY.command} always work.`;
const SLOTS: ReadonlyArray<Slot> = ["app", "global"];
const STATUS_WORD = { registered: "Registered", off: "Off", failed: "Not available" } as const;

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
  function recorder(action: ActionView, id: ShortcutId, slot: Slot, current: KeyboardView) {
    const binding = action[slot];
    const error = keyboard.errors[`${id}.${slot}`] ?? null;
    const line = bindingLine(error, binding, current.voiceOver);
    const ask = error !== null && typeof error === "object" && "warning" in error ? error : null;
    return (
      <ShortcutRecorder
        key={slot}
        appOnly={slot === "app"}
        id={`keyboard-${id}-${slot}-field`}
        label={`${action.label}, ${SLOT_NAME[slot]}`}
        keys={binding.display ?? undefined}
        spokenKeys={binding.spoken ?? undefined}
        conflict={ask ? undefined : (line ?? undefined)}
        warning={
          ask?.warning
            ? {
                reason: ask.warning.reason,
                onUseAnyway: () => keyboard.confirmAnyway(id, slot),
                onPickAnother: () => keyboard.pickAnother(id, slot),
              }
            : undefined
        }
        onRecordingChange={suspend}
        onRecord={(glyphs) => void suspension.current.then(() => keyboard.set(id, slot, glyphs))}
        onRestoreDefault={() => keyboard.restore(id, slot)}
      />
    );
  }
  return (
    <section id="settings-keyboard" aria-labelledby="settings-keyboard-heading">
      <h2 id="settings-keyboard-heading" tabIndex={-1} className="settings-heading">
        Keyboard
      </h2>
      {view ? (
        SHORTCUT_ROWS.map((id) => {
          const action = view.actions.find((a) => a.id === id);
          if (!action) return null;
          return (
            <SettingsRow
              key={id}
              id={`keyboard-${id}`}
              label={action.label}
              helper="Works while another app is in front."
              status={`Everywhere: ${STATUS_WORD[action.global.status]}`}
              disabledReason={disabledReason}
            >
              <div className="flex flex-col gap-4">
                {SLOTS.map((slot) => recorder(action, id, slot, view))}
              </div>
            </SettingsRow>
          );
        })
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
        <ShortcutList items={shortcutItems(view, singleKey)} />
      </div>
    </section>
  );
}
