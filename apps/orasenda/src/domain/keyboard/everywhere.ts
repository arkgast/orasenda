import type { ActionId, ActionView, KeyboardView } from "@shared/ipc/bindings";

/** The *Everywhere* binding of an action: its keys, glyphs, spoken form and status. */
export function everywhere(view: KeyboardView, id: ActionId): ActionView["global"] | null {
  return view.actions.find((action) => action.id === id)?.global ?? null;
}
