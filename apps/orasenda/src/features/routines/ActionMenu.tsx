import { Button, PopoverMenu, type PopoverMenuItem } from "@orasenda/ui";
import { type ReactElement, useId, useRef, useState } from "react";

type Props = {
  /** The visible word on the trigger: "More" or "Add". */
  label: string;
  /** The trigger's spoken name when the word repeats on the page: "More for Stretch". */
  name?: string;
  heading: string;
  items: PopoverMenuItem[];
  onSelect(id: string): void;
};

/** A quiet button that opens a `PopoverMenu` of actions. The host owns what each row does. */
export function ActionMenu({ label, name, heading, items, onSelect }: Props): ReactElement {
  const anchor = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  return (
    <span ref={anchor} className="app-routines-menu">
      <Button
        variant="quiet"
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        {label}
      </Button>
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

/** The More menu rows for one routine or habit at `index` of `count`. */
export function moreItems(index: number, count: number): PopoverMenuItem[] {
  return [
    { id: "edit", label: "Edit", kind: "link" },
    { id: "up", label: "Move up", kind: "link", disabled: index === 0 },
    { id: "down", label: "Move down", kind: "link", disabled: index === count - 1 },
    { id: "remove", label: "Remove", kind: "link" },
  ];
}

export type MoreAction = "edit" | "up" | "down" | "remove";
