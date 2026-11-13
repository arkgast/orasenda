import type { ActionId, ActionView, FixedKeyView, KeyboardView } from "@shared/ipc/bindings";
import { useMemo } from "react";
import { bindingsOf, fixedDisplay } from "./bindings";
import { useKeyboardView } from "./useKeyboardView";

/**
 * The registry as the webview reads it: the actions, the fixed keys and lookups. `byId` and
 * `fixedHint` answer undefined or null until `keyboard_state` has, so a consumer shows no hint
 * before the keys are known. The result is stable between views.
 */
export function useBindings(): {
  view: KeyboardView | null;
  actions: ActionView[];
  fixed: FixedKeyView[];
  byId(id: ActionId): ActionView | undefined;
  /** The glyphs of a fixed key by its canonical accelerator. */
  fixedHint(keys: string): string | null;
} {
  const { view } = useKeyboardView();
  return useMemo(() => {
    const { actions, fixed } = bindingsOf(view);
    return {
      view,
      actions,
      fixed,
      byId: (id: ActionId) => actions.find((action) => action.id === id),
      fixedHint: (keys: string) => fixedDisplay(fixed, keys),
    };
  }, [view]);
}
