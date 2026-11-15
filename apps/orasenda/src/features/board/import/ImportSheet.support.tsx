import type {
  ImportItemView_Serialize,
  ImportPreview_Serialize,
  ImportSourceKind,
  ImportSourcesView_Serialize,
} from "@shared/ipc/bindings";
import { type Backend, boardOf, type Replies } from "@shared/test/fixtures";
import { screen } from "@testing-library/react";
import { renderBoard, TASKS } from "../BoardPage.support";

export const SOURCES: ImportSourcesView_Serialize = {
  sources: [
    { kind: "reminders", available: true, reason: null },
    { kind: "todoist", available: true, reason: null },
    { kind: "things", available: true, reason: null },
  ],
};

export const BUSY_REASON = "Available between sessions, so nothing interrupts your focus.";

export function item(key: number, title: string, over: Partial<ImportItemView_Serialize> = {}) {
  return { key, title, meta: "", why: null, selected: true, onBoard: null, ...over };
}

export function previewOf(
  source: ImportSourceKind,
  items: ImportItemView_Serialize[],
  over: Partial<ImportPreview_Serialize> = {},
): ImportPreview_Serialize {
  const names = { reminders: "Reminders", todoist: "Todoist", things: "Things" };
  return {
    id: 7,
    source,
    sourceName: names[source],
    items,
    total: items.length,
    line: null,
    summary: [],
    ...over,
  };
}

export const THREE = [
  item(0, "Renew passport", { meta: "Home" }),
  item(1, "Call the bank"),
  item(2, "Buy stamps", { why: "Already on the Board, in Today" }),
];

export const picked = (preview: ImportPreview_Serialize) => ({ picked: preview });

/** Opens the Board with the import sheet asked for (the app bumps `importAsked`). */
export async function renderImport(replies: Replies = {}): Promise<Backend> {
  return renderBoard({
    replies: {
      import_sources: () => SOURCES,
      import_preview: () => picked(previewOf("reminders", THREE)),
      import_discard: () => null,
      task_import: () => ({ importId: 3, count: 3 }),
      task_import_undo: () => 3,
      import_open_settings: () => null,
      ...replies,
    },
    page: { importAsked: 1, onImportOpened: () => {} },
  });
}

export const sheet = () => screen.getByRole("dialog");
export const row = (name: RegExp | string) => screen.getByRole("button", { name });
export { boardOf, TASKS };
