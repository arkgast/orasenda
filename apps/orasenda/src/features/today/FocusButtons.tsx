import { Icon, IconButton } from "@orasenda/ui";
import type { BindingView } from "@shared/ipc/bindings";
import type { ReactElement } from "react";

export type FocusButtonId = "fullScreen" | "floater";

type Props = {
  /** The keys the Full screen tooltip names (`shownBinding`), or none while the registry is unknown. */
  fullScreen: BindingView | undefined;
  /** The keys the Floating timer tooltip names. */
  floater: BindingView | undefined;
  onRun(id: FocusButtonId): void;
};

const keys = (binding: BindingView | undefined) =>
  binding?.display ? { shortcut: binding.display } : {};

/**
 * Today's two ways into a focus view: *Full screen* enters at once (no menu, no display choice),
 * and *Floating timer* keeps its one-click path. Each `IconButton` carries its own Tooltip; the keys
 * come from the registry, so a rebinding shows here.
 */
export function FocusButtons({ fullScreen, floater, onRun }: Props): ReactElement {
  return (
    <>
      <IconButton
        label="Full screen"
        icon={<Icon name="expand" />}
        onClick={() => onRun("fullScreen")}
        {...keys(fullScreen)}
      />
      <IconButton
        label="Floating timer"
        icon={<Icon name="window" />}
        onClick={() => onRun("floater")}
        {...keys(floater)}
      />
    </>
  );
}
