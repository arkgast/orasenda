import { bindingLine } from "@domain/keyboard/bindings";
import { Button, ShortcutRecorder } from "@orasenda/ui";
import type { ActionView, KeyboardError, Slot } from "@shared/ipc/bindings";

const STATUS_WORD = { registered: "Registered", off: "Off", failed: "Not available" } as const;
const SLOTS: ReadonlyArray<Slot> = ["app", "global"];
/** The visible slot label; the recorder's accessible name is "<action>, <label>". */
const SLOT_LABEL: Record<Slot, string> = { app: "In Orasenda", global: "Everywhere" };

type Props = {
  action: ActionView;
  voiceOver: boolean;
  /** The last error of each slot, if any. */
  errors: Partial<Record<Slot, KeyboardError | null>>;
  onSet: (slot: Slot, glyphs: string | null) => void;
  /** Restore default for the whole row: both slots. */
  onRestore: () => void;
  onConfirm: (slot: Slot) => void;
  onPickAnother: (slot: Slot) => void;
  onRecordingChange: (on: boolean) => void;
};

/**
 * One registry action in the Shortcuts pane (picked 3A): its name, description, *Everywhere* status
 * and one Restore default on the left; the *In Orasenda* and *Everywhere* recorders on the right. The
 * recorders sit side by side from a 512px row and stack below that (container queries).
 */
export function ShortcutRow({
  action,
  voiceOver,
  errors,
  onSet,
  onRestore,
  onConfirm,
  onPickAnother,
  onRecordingChange,
}: Props) {
  const id = `keyboard-${action.id}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a div group named by its label and described by its description and status, as SettingsRow does
    <div
      id={id}
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-help ${id}-status`}
      className="@container border-b border-line py-4"
    >
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <p id={`${id}-label`} className="m-0 font-semibold">
            {action.label}
          </p>
          <p id={`${id}-help`} className="m-0 text-body-sm text-ink-muted">
            {action.description}
          </p>
          <p id={`${id}-status`} className="m-0 text-body-sm text-ink">
            {`Everywhere: ${STATUS_WORD[action.global.status]}`}
          </p>
          <Button variant="ghost" onClick={onRestore}>
            Restore default
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @2xl:col-span-2">
          {SLOTS.map((slot) => {
            const binding = action[slot];
            const error = errors[slot] ?? null;
            const line = bindingLine(error, action[slot], voiceOver);
            const ask =
              error !== null && typeof error === "object" && "warning" in error ? error : null;
            return (
              <div key={slot} className="min-w-0">
                <ShortcutRecorder
                  appOnly={slot === "app"}
                  id={`${id}-${slot}-field`}
                  label={SLOT_LABEL[slot]}
                  accessibleName={`${action.label}, ${SLOT_LABEL[slot]}`}
                  keys={binding.display ?? undefined}
                  spokenKeys={binding.spoken ?? undefined}
                  conflict={ask ? undefined : (line ?? undefined)}
                  warning={
                    ask?.warning
                      ? {
                          reason: ask.warning.reason,
                          onUseAnyway: () => onConfirm(slot),
                          onPickAnother: () => onPickAnother(slot),
                        }
                      : undefined
                  }
                  onRecordingChange={onRecordingChange}
                  onRecord={(glyphs) => onSet(slot, glyphs)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
