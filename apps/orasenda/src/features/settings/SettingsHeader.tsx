import { IconButton, type NavPage } from "@orasenda/ui";
import { type ReactElement, type ReactNode, useRef, useState } from "react";
import { JumpGlyph } from "../../app/glyphs";
import { PagesButton } from "../../app/PagesButton";
import { commands } from "../../ipc/bindings";

export type SectionId = "general" | "timer" | "notifications" | "appsAndSites" | "about";
export type SettingsTarget = SectionId | "focusMinutes" | "breakMinutes";

/** A visit to the page: a new `seq` is a new arrival (focus moves); `target` says where. */
export type Arrival = { seq: number; target?: SettingsTarget };

export const SECTIONS: ReadonlyArray<{ id: SectionId; name: string }> = [
  { id: "general", name: "General" },
  { id: "timer", name: "Timer" },
  { id: "notifications", name: "Notifications" },
  { id: "appsAndSites", name: "Apps and sites" },
  { id: "about", name: "About and data" },
];

type JumpProps = { current: SectionId; onJump(id: SectionId): void };

/** The compact stand-in for the SettingsIndex: a native menu of the sections, the current one checked. */
export function JumpButton({ current, onJump }: JumpProps): ReactElement {
  const box = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);

  const open = () => {
    const rect = box.current?.querySelector("button")?.getBoundingClientRect();
    setExpanded(true);
    commands
      .nativeMenuPopup({
        items: SECTIONS.map(({ id, name }) => ({ id, label: name, checked: id === current })),
        x: rect?.left ?? 0,
        y: rect?.bottom ?? 0,
      })
      .then(
        (chosen) => {
          setExpanded(false);
          // null: dismissed, or the menu could not be shown (logged in Rust). Nothing to do.
          const section = SECTIONS.find(({ id }) => id === chosen);
          if (section) onJump(section.id);
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
        label="Jump to section"
        icon={<JumpGlyph />}
        aria-haspopup="menu"
        aria-expanded={expanded}
        onClick={open}
      />
    </span>
  );
}

type PickerProps = JumpProps & { page: NavPage; onNavigate(page: NavPage): void };

/** PageFrame's `compactPicker` for Settings: the Pages button, then Jump to section. */
export function SettingsPicker({ page, onNavigate, current, onJump }: PickerProps): ReactNode {
  return (
    <>
      <PagesButton current={page} onNavigate={onNavigate} />
      <JumpButton current={current} onJump={onJump} />
    </>
  );
}
