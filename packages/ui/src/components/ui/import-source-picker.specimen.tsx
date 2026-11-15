import type { ReactElement } from "react";
import { useRef, useState } from "react";
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

/** The sheet's source step: Things is unavailable, with its reason. */
const sheetSources = sources.map((s) =>
  s.kind === "things" ? { ...s, disabledReason: REASON } : s,
);

export function ImportSourcePickerSpecimen(): ReactElement {
  const [open, setOpen] = useState(false);
  const first = useRef<HTMLElement>(null);
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
          size="sheet"
          title="Import tasks"
          description="Where are your tasks now?"
          cancelLabel="Close"
          onCancel={() => setOpen(false)}
          initialFocusRef={first}
        >
          <div className="@sheet-stack:col-span-2">
            <ImportSourcePicker ref={first} sources={sheetSources} onPick={() => setOpen(false)} />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
