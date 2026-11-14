import type { Handler } from "./backend";
import { backend } from "./backend";
import { rejects } from "./timer";

const FOLDER = "/Users/test/Library/Application Support/com.veloud.orasenda";
const POLICY = { frequency: "monthly", keep: 10 };

function overview(patch: Record<string, unknown> = {}) {
  return {
    counts: { sessions: 128, presets: 3, notes: 14, settings: 9 },
    folder: FOLDER,
    backups: [],
    policy: POLICY,
    totalBytes: 0,
    store: "ok",
    ...patch,
  };
}

const SAVED = { kind: "saved", file: "Orasenda data 2026-11-12.db" };
const IMPORTED = {
  kind: "imported",
  report: {
    added: { sessions: 12, presets: 1, notes: 3, settings: 0 },
    updated: { sessions: 0, presets: 0, notes: 0, settings: 2 },
  },
};

const OK = {
  data_overview: () => overview(),
  data_export: () => SAVED,
  data_import: () => IMPORTED,
  data_show_folder: () => null,
  data_delete_all: () => null,
};

/** Settings › Your data: the pane with a store, with the store out, and with the longest lines. */
export const YOUR_DATA: Record<string, Handler> = {
  yourData: backend({ replies: OK }),
  yourDataUnavailable: backend({
    replies: { ...OK, data_overview: () => overview({ counts: null, store: "unavailable" }) },
  }),
  // A deep folder name and an import that is refused with the longest line.
  yourDataLong: backend({
    replies: {
      ...OK,
      data_overview: () =>
        overview({ folder: `${FOLDER}/${"a-very-long-folder-name/".repeat(4)}` }),
      data_import: rejects("newer", "newer"),
    },
  }),
};
