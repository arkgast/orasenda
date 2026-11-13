import type { ReactElement } from "react";
import { useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button.tsx";
import { CommandPalette } from "./command-palette.tsx";

const commands = [
  { id: "start", label: "Start a session", hint: "Focus on one task", shortcut: "\u2318\u21a9" },
  { id: "pause", label: "Pause", shortcut: "⌘." },
  { id: "end", label: "End session", shortcut: "⇧⌘." },
  { id: "capture", label: "Capture a thought", shortcut: "⌃⌥C" },
  {
    id: "long",
    label: "Change the length of every focus session you start from the menu bar",
    hint: "Applies to new sessions only and never changes one already running on your desk",
    shortcut: "⇧⌘P",
  },
];

export function CommandPaletteSpecimen(): ReactElement {
  const [open, setOpen] = useState<"" | "regular" | "compact">("");
  const [last, setLast] = useState("");
  return (
    <>
      <Frame state="command-palette" width={300} height={140}>
        <Button onClick={() => setOpen("regular")}>Open the command palette</Button>
        <Button onClick={() => setOpen("compact")}>Open the compact command palette</Button>
        <p>{last ? `Ran ${last}` : "Nothing run yet"}</p>
      </Frame>
      {open ? (
        <CommandPalette
          compact={open === "compact"}
          commands={commands}
          onSelect={(id) => {
            setLast(id);
          }}
          onClose={() => setOpen("")}
        />
      ) : null}
    </>
  );
}
