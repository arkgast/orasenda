import { Button, Icon, IconButton, PopoverMenu, type PopoverMenuItem } from "@orasenda/ui";
import { type ReactElement, useId, useRef, useState } from "react";

type Props = {
  /** The trigger's id, so focus can come back to it after a move or an Undo (`moreId`). */
  id?: string;
  /** `more` is an icon button; `add` is the primary Add button with its plus and the word. */
  trigger: "more" | "add";
  /** The icon trigger's spoken name and tooltip: "More actions for Stretch". */
  name?: string;
  heading: string;
  items: PopoverMenuItem[];
  onSelect(id: string): void;
};

/** A quiet button that opens a `PopoverMenu` of actions. The host owns what each row does. */
export function ActionMenu({ id, trigger, name, heading, items, onSelect }: Props): ReactElement {
  const anchor = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const triggerProps = {
    id,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => setOpen((was) => !was),
  };
  return (
    <span ref={anchor} className="app-routines-menu">
      {trigger === "more" ? (
        <IconButton {...triggerProps} label={name ?? "More actions"} icon={<Icon name="more" />} />
      ) : (
        <Button {...triggerProps} variant="primary" aria-label="Add a routine or habit">
          <Icon name="plus" />
          Add
        </Button>
      )}
      {open ? (
        <PopoverMenu
          id={menuId}
          anchor={anchor}
          heading={heading}
          items={items}
          onSelect={onSelect}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </span>
  );
}

/** The id of the More trigger for routine or habit `itemId`. */
export const moreId = (itemId: string): string => `routines-more-${itemId}`;

/**
 * The More menu rows for one routine or habit at `index` of `count`. A routine's menu also has
 * *Add a step* (`step`).
 */
export function moreItems(index: number, count: number, step = false): PopoverMenuItem[] {
  return [
    { id: "edit", label: "Edit", kind: "link" },
    ...(step ? [{ id: "step", label: "Add a step", kind: "link" as const }] : []),
    { id: "up", label: "Move up", kind: "link", disabled: index === 0 },
    { id: "down", label: "Move down", kind: "link", disabled: index === count - 1 },
    { id: "remove", label: "Remove", kind: "link" },
  ];
}

export type MoreAction = "edit" | "step" | "up" | "down" | "remove";
