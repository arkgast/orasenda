import type { ReactElement } from "react";
import { useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button.tsx";
import { Dialog } from "./dialog.tsx";
import { ImportSourcePicker } from "./import-source-picker.tsx";

const sources = [
  { kind: "reminders", name: "Reminders", description: "Open reminders on this Mac." },
  { kind: "things", name: "Things", description: "Open to-dos from the Things app." },
  { kind: "todoist", name: "Todoist", description: "A CSV export or its zip." },
];

const REASON = "Available between sessions, so nothing interrupts your focus.";

const blocked = sources.map((s) => (s.kind === "todoist" ? s : { ...s, disabledReason: REASON }));

export function ImportSourcePickerSpecimen(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Frame state="import-source-picker-default" width={420} height={260}>
        <ImportSourcePicker sources={sources} onPick={() => undefined} />
      </Frame>
      <Frame state="import-source-picker-reading" width={420} height={260}>
        <ImportSourcePicker sources={sources} reading="things" onPick={() => undefined} />
      </Frame>
      <Frame state="import-source-picker-unavailable" width={420} height={320}>
        <ImportSourcePicker sources={blocked} onPick={() => undefined} />
      </Frame>
      <Frame state="import-source-picker-sheet" width={300} height={72}>
        <Button onClick={() => setOpen(true)}>Open the source step</Button>
      </Frame>
      {open ? (
        <Dialog
          title="Import tasks"
          description="Where are your tasks now?"
          cancelLabel="Cancel"
          onCancel={() => setOpen(false)}
        >
          <ImportSourcePicker
            sources={[sources[0], { ...sources[1], disabledReason: REASON }, sources[2]].flatMap(
              (s) => (s ? [s] : []),
            )}
            onPick={() => setOpen(false)}
          />
        </Dialog>
      ) : null}
    </>
  );
}
