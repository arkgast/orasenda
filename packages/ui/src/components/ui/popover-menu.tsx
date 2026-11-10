import type { JSX, RefObject } from "react";

export interface PopoverMenuItem {
  id: string;
}
export interface PopoverMenuProps {
  heading: string;
  items: PopoverMenuItem[];
  anchor: RefObject<HTMLElement | null>;
}

export function PopoverMenu(_props: PopoverMenuProps): JSX.Element {
  return <></>;
}
