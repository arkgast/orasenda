import type { ReactElement } from "react";
import { useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button.tsx";
import { CommandPalette } from "./command-palette.tsx";

const commands = [
  { id: "start", label: "Start a session", hint: "Focus on one task" },
  { id: "pause", label: "Pause" },
  { id: "end", label: "End session" },
  { id: "capture", label: "Capture a thought" },
];

export function CommandPaletteSpecimen(): ReactElement {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState("");
  return (
    <>
      <Frame state="command-palette" width={300} height={96}>
        <Button onClick={() => setOpen(true)}>Open the command palette</Button>
        <p>{last ? `Ran ${last}` : "Nothing run yet"}</p>
      </Frame>
      {open ? (
        <CommandPalette commands={commands} onSelect={setLast} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
