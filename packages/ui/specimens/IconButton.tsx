import type { ReactElement } from "react";
import { IconButton } from "../index.ts";
import { Frame } from "./Frame.tsx";
import { Menu, Pause, Play, Shrink, Stop } from "./icons.tsx";

export function IconButtonSpecimen(): ReactElement {
  return (
    <>
      <Frame state="icon-button-md" width={120} height={80}>
        <IconButton label="Pause session" icon={<Pause />} />
      </Frame>
      <Frame state="icon-button-md-shortcut" width={120} height={80}>
        <IconButton label="End session" icon={<Stop />} shortcut="⌘." />
      </Frame>
      <Frame state="icon-button-round" width={140} height={100}>
        <IconButton
          label="Resume session"
          icon={<Play />}
          shortcut="Space"
          keyshortcuts={false}
          size="round"
        />
      </Frame>
      <Frame state="icon-button-menu-trigger" width={120} height={80}>
        <IconButton
          label="Pages"
          icon={<Menu />}
          id="pages-trigger"
          aria-haspopup="menu"
          aria-expanded={false}
        />
      </Frame>
      <Frame state="icon-button-pages-keys" width={140} height={80}>
        <IconButton
          label="Pages"
          icon={<Menu />}
          shortcut={["⌘1", "⌘2", "⌘3", "⌘4", "⌘5", "⌘6"]}
          shortcutLabel="⌘1–6"
          aria-haspopup="menu"
          aria-expanded={false}
        />
      </Frame>
      <Frame state="icon-button-leave-full-screen" width={120} height={80}>
        <IconButton label="Leave full screen" icon={<Shrink />} shortcut="Esc" />
      </Frame>
      <Frame state="icon-button-disabled" width={360} height={80}>
        <IconButton label="Jump to section" icon={<Menu />} disabled aria-describedby="jump-why" />
        <span className="specimen-label" id="jump-why">
          {" "}
          Nothing to jump to yet.
        </span>
      </Frame>
    </>
  );
}
