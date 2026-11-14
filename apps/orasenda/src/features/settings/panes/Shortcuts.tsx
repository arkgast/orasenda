import { KEY } from "@domain/keyboard/glyphs";
import { Choice, SettingsRow, ShortcutList } from "@orasenda/ui";
import type { Group } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { type Ref, useRef } from "react";
import { ShortcutRow } from "../ShortcutRow";
import { shortcutItems } from "../shortcutItems";
import { useKeyboard } from "../useKeyboard";

const SINGLE_KEY_HELP = `Space, F and P on Today, Space in Focus view. Shortcuts with ${KEY.command} always work.`;
/** Where an action works, in the order the pane lists them. */
const GROUPS: ReadonlyArray<{ group: Group; title: string }> = [
  { group: "fullScreen", title: "Full screen" },
  { group: "timer", title: "Timer" },
  { group: "capture", title: "Capture" },
];

type Props = {
  headingRef: Ref<HTMLHeadingElement>;
  singleKey: boolean;
  disabled: boolean;
  disabledReason?: string;
  status?: string;
  onSingleKey: (checked: boolean) => void;
  /** The save line ("Start or pause focus: ⌃⌥G."). */
  onSaved: (text: string) => void;
};

export function Shortcuts({
  headingRef,
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
      <h2
        ref={headingRef}
        id="settings-keyboard-heading"
        tabIndex={-1}
        className="settings-heading"
      >
        Shortcuts
      </h2>
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
      {view ? (
        GROUPS.map(({ group, title }) => {
          const actions = view.actions.filter((a) => a.group === group);
          if (actions.length === 0) return null;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a group named by its heading; a section would be a landmark, and the pane has one
            <div key={group} role="group" aria-labelledby={`keyboard-group-${group}`}>
              <h3 id={`keyboard-group-${group}`} className="m-0 pt-4 text-heading">
                {title}
              </h3>
              {actions.map((action) => (
                <ShortcutRow
                  key={action.id}
                  action={action}
                  voiceOver={view.voiceOver}
                  errors={{
                    app: keyboard.errors[`${action.id}.app`],
                    global: keyboard.errors[`${action.id}.global`],
                  }}
                  onSet={(slot, glyphs) =>
                    void suspension.current.then(() => keyboard.set(action.id, slot, glyphs))
                  }
                  onRestore={() => {
                    keyboard.restore(action.id, "app");
                    keyboard.restore(action.id, "global");
                  }}
                  onConfirm={(slot) => keyboard.confirmAnyway(action.id, slot)}
                  onPickAnother={(slot) => keyboard.pickAnother(action.id, slot)}
                  onRecordingChange={suspend}
                />
              ))}
            </div>
          );
        })
      ) : keyboard.loadFailed ? (
        <p className="app-muted">Orasenda can't read keyboard settings right now.</p>
      ) : null}
      <div className="flex flex-col gap-2 py-4">
        <p className="m-0 font-semibold">All shortcuts</p>
        <ShortcutList items={shortcutItems(view, singleKey)} />
      </div>
    </section>
  );
}
