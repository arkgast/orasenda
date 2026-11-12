import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { IconButton } from "../../index";
import { Icon } from "./icon.tsx";

export function IconButtonSpecimen(): ReactElement {
  return (
    <>
      <Frame state="icon-button-md" width={120} height={80}>
        <IconButton label="Pause session" icon={<Icon name="pause" />} />
      </Frame>
      <Frame state="icon-button-md-shortcut" width={120} height={80}>
        <IconButton label="End session" icon={<Icon name="stop" />} shortcut="⌘." />
      </Frame>
      <Frame state="icon-button-round" width={140} height={100}>
        <IconButton
          label="Resume session"
          icon={<Icon name="play" />}
          shortcut="Space"
          keyshortcuts={false}
          size="round"
        />
      </Frame>
      <Frame state="icon-button-menu-trigger" width={120} height={80}>
        <IconButton
          label="Pages"
          icon={<Icon name="menu" />}
          id="pages-trigger"
          aria-haspopup="menu"
          aria-expanded={false}
        />
      </Frame>
      <Frame state="icon-button-pages-keys" width={140} height={80}>
        <IconButton
          label="Pages"
          icon={<Icon name="menu" />}
          shortcut={["⌘1", "⌘2", "⌘3", "⌘4", "⌘5", "⌘6"]}
          shortcutLabel="⌘1–6"
          aria-haspopup="menu"
          aria-expanded={false}
        />
      </Frame>
      <Frame state="icon-button-leave-full-screen" width={120} height={80}>
        <IconButton label="Leave full screen" icon={<Icon name="collapse" />} shortcut="Esc" />
      </Frame>
      <Frame state="icon-button-disabled" width={360} height={80}>
        <IconButton
          label="Jump to section"
          icon={<Icon name="menu" />}
          disabled
          aria-describedby="jump-why"
        />
        <span className="text-caption text-ink-muted" id="jump-why">
          {" "}
          Nothing to jump to yet.
        </span>
      </Frame>
    </>
  );
}
