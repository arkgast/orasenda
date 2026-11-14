import { selectedPreset } from "@domain/presets/presets";
import { Button, ChoiceGroup, SettingsRow } from "@orasenda/ui";
import type { PresetEntry, Settings } from "@shared/ipc/bindings";
import { type Ref, useEffect, useId, useRef } from "react";
import { PresetTable, presetEditButton, presetEditorId } from "../PresetTable";
import { type CadenceChange, CadenceRows } from "../sections/CadenceRows";
import { PresetEditor } from "../sections/PresetEditor";
import type { PresetEditing } from "../usePresets";

/** The selected preset's name, for the failure line's "Back to". */
export function presetLabel(presets: PresetEntry[], settings: Pick<Settings, "presetId">): string {
  return selectedPreset(presets, settings)?.name ?? "";
}

type Props = {
  headingRef: Ref<HTMLHeadingElement>;
  settings: Settings;
  /** The live presets, in order. */
  presets: PresetEntry[];
  /** presets_list failed: say so instead of showing nothing. */
  presetsFailed?: boolean;
  running: boolean;
  disabled: boolean;
  /** Editing is off: the store is read-only or can't be written. */
  editLocked: boolean;
  disabledReason?: string;
  presetStatus?: string;
  cadenceStatus?: string;
  editor: PresetEditing;
  onPreset: (presetId: string) => void;
  onCadence: CadenceChange;
};

export function Timer({
  headingRef,
  settings,
  presets,
  presetsFailed = false,
  running,
  disabled,
  editLocked,
  disabledReason,
  presetStatus,
  cadenceStatus,
  editor,
  onPreset,
  onCadence,
}: Props) {
  const selected = selectedPreset(presets, settings);
  const group = useId();
  const reasons = `${group}-why`;
  const open = presets.find((p) => p.id === editor.editing);
  const editorRef = useRef<HTMLDivElement>(null);
  const openId = open?.id;
  // The editor sits under its row; bring it into view without a jump or a smooth scroll.
  useEffect(() => {
    if (openId) editorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [openId]);
  return (
    <section id="settings-timer" aria-labelledby="settings-timer-heading">
      <h2 ref={headingRef} id="settings-timer-heading" tabIndex={-1} className="settings-heading">
        Timer
      </h2>
      {running ? (
        <p className="app-muted">A session is running. Changes apply to your next session.</p>
      ) : null}
      <SettingsRow
        id="preset"
        label="Preset"
        helper="New sessions start with this. Steady Focus is Pomodoro-style."
        status={presetStatus}
        disabledReason={disabledReason}
      >
        {presetsFailed && presets.length === 0 ? (
          <p className="app-muted" role="status">
            Can't read your presets right now.
          </p>
        ) : null}
        <ChoiceGroup legend="Preset library" legendClassName="sr-only">
          <PresetTable
            presets={presets}
            selectedId={selected?.id}
            group={group}
            disabled={disabled}
            locked={editLocked}
            canRemove={editor.canRemove}
            removeReason="At least one preset stays."
            editingId={open?.id ?? null}
            renderEditor={() =>
              open ? (
                <div id={presetEditorId(open.id)} ref={editorRef}>
                  <PresetEditor
                    preset={open}
                    errors={editor.errors}
                    disabled={editLocked}
                    focusName={editor.focusName}
                    onSave={(field, value) => editor.save(open.id, field, value)}
                    onClearError={editor.clearError}
                    onDone={() => {
                      editor.open(null);
                      presetEditButton(document, open.id)?.focus();
                    }}
                  />
                </div>
              ) : null
            }
            onSelect={onPreset}
            onEdit={(id) => editor.open(editor.editing === id ? null : id)}
            onRemove={editor.remove}
          />
        </ChoiceGroup>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-disabled={!editor.canAdd}
            aria-describedby={editor.canAdd ? undefined : `${reasons}-add`}
            disabled={editLocked}
            onClick={() => editor.add()}
          >
            Add preset
          </Button>
          <Button
            aria-disabled={!editor.canRestore}
            aria-describedby={editor.canRestore ? undefined : `${reasons}-restore`}
            disabled={editLocked}
            onClick={() => editor.restore()}
          >
            Restore default presets
          </Button>
        </div>
        {editor.canAdd ? null : (
          <p id={`${reasons}-add`} className="app-muted">
            Up to 12 presets.
          </p>
        )}
        {editor.canRestore ? null : (
          <p id={`${reasons}-restore`} className="app-muted">
            The default presets are all here.
          </p>
        )}
      </SettingsRow>
      <CadenceRows
        settings={settings}
        selected={selected}
        disabled={disabled}
        disabledReason={disabledReason}
        status={cadenceStatus}
        onChange={onCadence}
      />
    </section>
  );
}
