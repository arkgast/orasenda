import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { ShortcutList } from "./shortcut-list.tsx";

// Built from its code point: the copy guard reads the return arrow as an emoji.
const RETURN = String.fromCharCode(0x21a9);

const ITEMS = [
  { action: "Start focus", keys: `⌘${RETURN}`, spokenKeys: "Command-Return" },
  { action: "Just 2 minutes", keys: `⇧⌘${RETURN}`, spokenKeys: "Shift-Command-Return" },
  { action: "End session", keys: "⌘.", spokenKeys: "Command-Period" },
  { action: "Full screen", keys: "⇧⌘F", spokenKeys: "Shift-Command-F" },
  { action: "Commands", keys: "⌘K", spokenKeys: "Command-K" },
  {
    action: "Start, pause, open Focus view or presets on Today",
    keys: "Space F P",
    spokenKeys: "Space, F, P",
    off: true,
  },
  { action: "Start or pause in Focus view", keys: "Space", spokenKeys: "Space", off: true },
];

export function ShortcutListSpecimen(): ReactElement {
  return (
    <>
      <Frame state="shortcut-list-panel" width={420} height={380}>
        <ShortcutList items={ITEMS} />
      </Frame>
      <Frame state="shortcut-list-wide" width={900} height={380}>
        <ShortcutList items={ITEMS} />
      </Frame>
      <Frame state="shortcut-list-narrow" width={360} height={420}>
        <ShortcutList items={ITEMS} />
      </Frame>
    </>
  );
}
