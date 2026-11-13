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
      <Frame state="shortcut-recorder-warning" width={420} height={260}>
        <ShortcutRecorder
          label={LABEL}
          keys="⌃⌥⌘T"
          warning={{
            reason: "Other apps use this.",
            onUseAnyway: () => {},
            onPickAnother: () => {},
          }}
          onRecord={() => {}}
        />
      </Frame>
      <Frame state="shortcut-recorder-row" width={488} height={300}>
        <div className="grid grid-cols-2 gap-4">
          <ShortcutRecorder
            label="In Orasenda"
            accessibleName="Full screen, In Orasenda"
            keys="⇧⌘F"
            appOnly
            recording
            onRecord={() => {}}
          />
          <ShortcutRecorder
            label="Everywhere"
            accessibleName="Full screen, Everywhere"
            onRecord={() => {}}
          />
        </div>
      </Frame>
      <Frame state="shortcut-recorder-row-failed" width={488} height={300}>
        <div className="grid grid-cols-2 gap-4">
          <ShortcutRecorder
            label="In Orasenda"
            accessibleName="Full screen, In Orasenda"
            keys="⇧⌘F"
            appOnly
            onRecord={() => {}}
          />
          <ShortcutRecorder
            label="Everywhere"
            accessibleName="Full screen, Everywhere"
            keys="⌃⌥⌘T"
            onRecord={() => {}}
          />
        </div>
        <p className="m-0 mt-2 text-body-sm text-ink-muted">Not available</p>
      </Frame>
      <Frame state="shortcut-recorder-row-voiceover" width={488} height={360}>
        <div className="grid grid-cols-2 gap-4">
          <ShortcutRecorder
            label="In Orasenda"
            accessibleName="Full screen, In Orasenda"
            keys="⇧⌘F"
            appOnly
            onRecord={() => {}}
          />
          <ShortcutRecorder
            label="Everywhere"
            accessibleName="Full screen, Everywhere"
            keys="⌃⌥⌘F"
            conflict="VoiceOver uses this key while it's on. Pick another to use both."
            onRecord={() => {}}
          />
        </div>
      </Frame>
      <Frame state="shortcut-recorder-row-warning" width={488} height={360}>
        <div className="grid grid-cols-2 gap-4">
          <ShortcutRecorder
            label="In Orasenda"
            accessibleName="Full screen, In Orasenda"
            keys="⇧⌘F"
            appOnly
            onRecord={() => {}}
          />
          <ShortcutRecorder
            label="Everywhere"
            accessibleName="Full screen, Everywhere"
            keys="⌃⌥⌘T"
            warning={{
              reason: "Other apps use this.",
              onUseAnyway: () => {},
              onPickAnother: () => {},
            }}
            onRecord={() => {}}
          />
        </div>
      </Frame>
    </>
  );
}
