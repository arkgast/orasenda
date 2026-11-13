import { pageAccelerator, pagesRange } from "@domain/keyboard/bindings";
import { describeShortcut, type ShortcutListItem } from "@orasenda/ui";
import type { FixedKeyView, KeyboardView } from "@shared/ipc/bindings";

type Entry = { action: string; keys: string; spoken?: string; single?: boolean };

/** Today's single keys besides the registry's own (F and P go with H4). */
const TODAY_EXTRA = ["F", "P"];

const PAGES = 6;

/** The fixed keys All shortcuts lists, by accelerator; the page keys fold into one row, the menu's standard items are left out. */
const SHOWN_FIXED = new Set([
  "Super+KeyK",
  "Super+Comma",
  "Super+Enter",
  "Shift+Super+Enter",
  "Super+Period",
  "Escape",
]);

function fixedEntries(fixed: ReadonlyArray<FixedKeyView>): Entry[] {
  const rows: Entry[] = fixed
    .filter((f) => SHOWN_FIXED.has(f.keys))
    .map((f) => ({ action: f.label, keys: f.display, spoken: f.spoken }));
  const range = pagesRange(fixed, PAGES);
  const first = fixed.find((f) => f.keys === pageAccelerator(1));
  if (range && first) {
    rows.push({
      action: "Go to a page",
      keys: range,
      spoken: `${first.spoken} to ${PAGES}`,
    });
  }
  return rows;
}

function entries(view: KeyboardView | null): Entry[] {
  const actions = (view?.actions ?? []).filter((action) => action.app.display);
  const space = view?.actions.find((a) => a.id === "startPause")?.singleKey ?? null;
  return [
    ...fixedEntries(view?.fixed ?? []),
    ...actions.map((a) => ({
      action: a.label,
      keys: a.app.display ?? "",
      spoken: a.app.spoken ?? undefined,
    })),
    ...(space
      ? [
          { action: "On Today", keys: [space, ...TODAY_EXTRA].join(" "), single: true },
          { action: "In Focus view", keys: space, single: true },
        ]
      : []),
  ];
}

/**
 * The All shortcuts items, from the registry; the single keys are marked off while single-key
 * shortcuts are off. `spokenKeys` comes from the registry where it has the binding.
 */
export function shortcutItems(view: KeyboardView | null, singleKey: boolean): ShortcutListItem[] {
  return entries(view).map(({ action, keys, spoken, single }) => ({
    action,
    keys,
    spokenKeys:
      spoken ??
      keys
        .split(" ")
        .map((key) => describeShortcut(key).spoken)
        .join(", "),
    off: single && !singleKey ? true : undefined,
  }));
}
