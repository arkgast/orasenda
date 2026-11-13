import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Choice } from "./choice.tsx";
import { DataTable, type DataTableColumn } from "./data-table.tsx";
import { EmptyState } from "./empty-state.tsx";

interface Preset {
  id: string;
  name: string;
  focus: number;
  rest: number;
  longRest: number;
  rounds: number;
}
const PRESETS: Preset[] = [
  { id: "classic", name: "Classic", focus: 25, rest: 5, longRest: 15, rounds: 4 },
  { id: "steady", name: "Steady Focus", focus: 50, rest: 10, longRest: 20, rounds: 3 },
  {
    id: "long",
    name: "Long and Gentle Afternoon Reading Sessions",
    focus: 90,
    rest: 15,
    longRest: 30,
    rounds: 2,
  },
];
const LONG_NAME = "Unbroken".repeat(12);
const TWELVE_PRESETS: Preset[] = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i}`,
  name: `Preset ${i + 1}`,
  focus: 20 + i * 5,
  rest: 5,
  longRest: 15,
  rounds: 4,
}));

const presetColumns: DataTableColumn<Preset>[] = [
  { key: "name", header: "Name", cell: (p) => p.name },
  { key: "focus", header: "Focus", cell: (p) => p.focus, numeric: true },
  { key: "rest", header: "Break", cell: (p) => p.rest, numeric: true },
  { key: "longRest", header: "Long break", cell: (p) => p.longRest, numeric: true },
  { key: "rounds", header: "Rounds", cell: (p) => p.rounds, numeric: true },
];

interface Backup {
  id: string;
  date: string;
  kind: string;
  size: number;
  newer?: boolean;
}
const KINDS = ["Automatic", "Before import", "Manual", "Before restore"];
function backups(count: number): Backup[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    date: `${28 - i} October 2026, ${String(9 + (i % 9)).padStart(2, "0")}:12`,
    kind: KINDS[i % KINDS.length] ?? "Automatic",
    size: 300 + i * 4,
    newer: i === 2,
  }));
}
const backupColumns: DataTableColumn<Backup>[] = [
  { key: "date", header: "Date", cell: (b) => b.date },
  { key: "kind", header: "Kind", cell: (b) => b.kind },
  { key: "size", header: "Size", cell: (b) => `${b.size} KB`, numeric: true },
];
const backupActions = (b: Backup) => [
  {
    label: `Restore the backup from ${b.date}`,
    icon: "restore" as const,
    onSelect: () => undefined,
    disabled: b.newer,
    reason: b.newer ? "From a newer Orasenda" : undefined,
  },
  {
    label: `Delete the backup from ${b.date}`,
    icon: "delete" as const,
    onSelect: () => undefined,
  },
];
const footerFor = (list: Backup[]): string =>
  `${list.length} ${list.length === 1 ? "backup" : "backups"}, ${list.reduce((n, b) => n + b.size, 0)} KB`;

function BackupTable({ list }: { list: Backup[] }): ReactElement {
  return (
    <DataTable
      caption="Backups"
      columns={backupColumns}
      rows={list}
      rowKey={(b) => b.id}
      actions={backupActions}
      footer={list.length ? footerFor(list) : undefined}
      empty={
        <EmptyState
          variant="inline"
          message="No backups yet. The first one is made automatically, or choose Back up now."
        />
      }
    />
  );
}

function PresetTable({ list }: { list: Preset[] }): ReactElement {
  return (
    <DataTable
      caption="Presets"
      columns={presetColumns}
      rows={list}
      rowKey={(p) => p.id}
      actions={(p) => [
        { label: `Edit ${p.name}`, icon: "edit", onSelect: () => undefined },
        { label: `Remove ${p.name}`, icon: "close", onSelect: () => undefined },
      ]}
      footer={`${list.length} ${list.length === 1 ? "preset" : "presets"}`}
      empty={<EmptyState variant="inline" />}
    />
  );
}

export function DataTableSpecimen(): ReactElement {
  const twelve = backups(12);
  return (
    <>
      <Frame state="data-table-presets-900" width={900} height={260}>
        <PresetTable list={PRESETS} />
      </Frame>
      <Frame state="data-table-presets-1-360" width={360} height={200}>
        <PresetTable list={PRESETS.slice(0, 1)} />
      </Frame>
      <Frame state="data-table-presets-12-360" width={360} height={1100}>
        <PresetTable list={TWELVE_PRESETS} />
      </Frame>
      <Frame state="data-table-presets-selection-360" width={360} height={200}>
        <DataTable
          caption="Presets"
          columns={presetColumns.slice(0, 2)}
          rows={PRESETS.slice(0, 2)}
          rowKey={(p) => p.id}
          selection={{
            header: "Chosen",
            cell: (p) => (
              <Choice name="chosen" value={p.id} className="min-w-hit-min justify-center">
                <span className="sr-only">{p.name}</span>
              </Choice>
            ),
          }}
          empty={null}
        />
      </Frame>
      <Frame state="data-table-presets-long-360" width={360} height={360}>
        <PresetTable
          list={[{ id: "x", name: LONG_NAME, focus: 25, rest: 5, longRest: 15, rounds: 4 }]}
        />
      </Frame>
      <Frame state="data-table-backups-1-360" width={360} height={140}>
        <BackupTable list={backups(1)} />
      </Frame>
      <Frame state="data-table-backups-12-360" width={360} height={1100}>
        <BackupTable list={twelve} />
      </Frame>
      <Frame state="data-table-backups-newer-360" width={360} height={320}>
        <BackupTable list={twelve.slice(1, 4)} />
      </Frame>
      <Frame state="data-table-backups-empty-360" width={360} height={140}>
        <BackupTable list={[]} />
      </Frame>
    </>
  );
}
