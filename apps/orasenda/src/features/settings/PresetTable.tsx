import { Choice, DataTable, type DataTableColumn } from "@orasenda/ui";
import type { PresetEntry } from "@shared/ipc/bindings";
import type { ReactNode } from "react";

/** The id of a preset's Edit button. */
export const presetEditId = (presetId: string): string => `preset-${presetId}-edit`;
/** The id of a preset's editor panel. */
export const presetEditorId = (presetId: string): string => `preset-${presetId}-editor`;

/** The Edit button in a preset's row. */
export function presetEditButton(root: ParentNode, presetId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`#${CSS.escape(presetEditId(presetId))}`);
}

type Props = {
  presets: PresetEntry[];
  selectedId: string | undefined;
  /** The radio group's name. */
  group: string;
  /** Picking is off (a settings change is held). */
  disabled: boolean;
  /** Editing is off: the store is read-only or can't be written. */
  locked: boolean;
  canRemove: boolean;
  /** Under the last row when Remove is off. */
  removeReason: string;
  /** The preset whose editor is open. */
  editingId?: string | null;
  /** The editor, shown under its row. */
  renderEditor?: (presetId: string) => ReactNode;
  onSelect: (presetId: string) => void;
  onEdit: (presetId: string) => void;
  onRemove: (presetId: string) => void;
};

/** The preset library as a table: the radio in the Name cell, the lengths, then Edit and Remove. */
export function PresetTable({
  presets,
  selectedId,
  group,
  disabled,
  locked,
  canRemove,
  removeReason,
  editingId,
  renderEditor,
  onSelect,
  onEdit,
  onRemove,
}: Props) {
  const columns: DataTableColumn<PresetEntry>[] = [
    {
      key: "name",
      header: "Name",
      cell: (p) => (
        <Choice
          id={`preset-${p.id}-radio`}
          name={group}
          value={p.id}
          checked={selectedId === p.id}
          disabled={disabled}
          onChange={() => onSelect(p.id)}
        >
          {p.name}
        </Choice>
      ),
    },
    { key: "focus", header: "Focus", numeric: true, cell: (p) => p.focusMin },
    { key: "break", header: "Break", numeric: true, cell: (p) => p.breakMin },
    { key: "long", header: "Long break", numeric: true, cell: (p) => p.longBreakMin },
    { key: "rounds", header: "Rounds", numeric: true, cell: (p) => p.rounds },
  ];
  return (
    <DataTable
      caption="Preset library, lengths in minutes"
      columns={columns}
      rows={presets}
      rowKey={(p) => p.id}
      empty={null}
      detail={(p) => (editingId === p.id ? renderEditor?.(p.id) : null)}
      actions={(p) => [
        {
          label: `Edit ${p.name}`,
          icon: "edit",
          id: presetEditId(p.id),
          expanded: editingId === p.id,
          controls: editingId === p.id ? presetEditorId(p.id) : undefined,
          disabled: locked,
          onSelect: () => onEdit(p.id),
        },
        {
          label: `Remove ${p.name}`,
          icon: "close",
          disabled: locked || !canRemove,
          reason: canRemove ? undefined : removeReason,
          onSelect: () => onRemove(p.id),
        },
      ]}
    />
  );
}
