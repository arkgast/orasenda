import { Icon, IconButton, type NavPage } from "@orasenda/ui";
import { commands } from "@shared/ipc/bindings";
import { type ReactElement, useRef, useState } from "react";
import { requestPalette } from "./palette/paletteRequest";

export const PAGE_ORDER: ReadonlyArray<{ id: NavPage; label: string }> = [
  { id: "today", label: "Today" },
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
  { id: "routines", label: "Routines" },
  { id: "review", label: "Review" },
  { id: "settings", label: "Settings" },
];

const CHORDS = PAGE_ORDER.map((_, index) => `⌘${index + 1}`);

type Props = {
  current: NavPage;
  onNavigate(page: NavPage): void;
};

/** The way to the other pages when the window is compact: a native menu of the six pages. */
export function PagesButton({ current, onNavigate }: Props): ReactElement {
  const box = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);

  const open = () => {
    const rect = box.current?.querySelector("button")?.getBoundingClientRect();
    setExpanded(true);
    commands
      .nativeMenuPopup({
        items: [
          ...PAGE_ORDER.map(({ id, label }, index) => ({
            id,
            label,
            accelerator: `Cmd+${index + 1}`,
            checked: id === current,
          })),
          { id: "commands", label: "Commands…", accelerator: "Cmd+K", checked: null },
        ],
        x: rect?.left ?? 0,
        y: rect?.bottom ?? 0,
      })
      .then(
        (chosen) => {
          setExpanded(false);
          // null: dismissed, or the menu could not be shown (logged in Rust). Nothing to do.
          if (chosen === "commands") {
            requestPalette();
            return;
          }
          const page = PAGE_ORDER.find(({ id }) => id === chosen);
          if (page) onNavigate(page.id);
        },
        (error: unknown) => {
          setExpanded(false);
          console.error("native_menu_popup failed", error);
        },
      );
  };

  return (
    <span ref={box} className="inline-flex">
      <IconButton
        label="Pages"
        icon={<Icon name="pages" />}
        shortcut={CHORDS}
        shortcutLabel="⌘1–6"
        aria-haspopup="menu"
        aria-expanded={expanded}
        onClick={open}
      />
    </span>
  );
}
