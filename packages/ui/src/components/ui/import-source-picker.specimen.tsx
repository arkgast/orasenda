import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { ImportSourcePicker } from "./import-source-picker.tsx";

const sources = [
  { kind: "reminders", name: "Reminders", description: "Open reminders on this Mac." },
  { kind: "things", name: "Things", description: "Open to-dos from the Things app." },
  { kind: "todoist", name: "Todoist", description: "A CSV export or its zip." },
];

const blocked = sources.map((s) =>
  s.kind === "todoist"
    ? s
    : { ...s, disabledReason: "Available between sessions, so nothing interrupts your focus." },
);

export function ImportSourcePickerSpecimen(): ReactElement {
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
    </>
  );
}
