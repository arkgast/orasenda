import type { ReactElement } from "react";
import { useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { ShortcutRecorder } from "./shortcut-recorder.tsx";

const LABEL = "Start or pause focus from anywhere";

function Live(): ReactElement {
  const [keys, setKeys] = useState<string | undefined>("⌃⌥F");
  return (
    <Frame state="shortcut-recorder-live" width={300} height={300}>
      <ShortcutRecorder
        label={LABEL}
        keys={keys}
        onRecord={(next) => setKeys(next ?? undefined)}
        onRestoreDefault={() => setKeys("⌃⌥F")}
      />
      <p>{keys ? `Keys ${keys}` : "Shortcut is off"}</p>
    </Frame>
  );
}

export function ShortcutRecorderSpecimen(): ReactElement {
  return (
    <>
      <Live />
      <Frame state="shortcut-recorder-idle" width={300} height={160}>
        <ShortcutRecorder label={LABEL} keys="⌃⌥F" onRecord={() => {}} />
      </Frame>
      <Frame state="shortcut-recorder-recording" width={300} height={160}>
        <ShortcutRecorder label={LABEL} keys="⌃⌥F" recording onRecord={() => {}} />
      </Frame>
      <Frame state="shortcut-recorder-conflict" width={420} height={200}>
        <ShortcutRecorder
          label={LABEL}
          keys="⌘K"
          conflict="Orasenda uses ⌘K for Commands. Pick a different one."
          onRecord={() => {}}
        />
      </Frame>
      <Frame state="shortcut-recorder-off" width={300} height={160}>
        <ShortcutRecorder label={LABEL} onRecord={() => {}} />
      </Frame>
    </>
  );
}
