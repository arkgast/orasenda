import type { ReactElement } from "react";
import { useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button.tsx";
import { CapturePad, type InterruptionKind } from "./capture-pad.tsx";

type Mode = "" | "saves" | "fails";

export function CapturePadSpecimen(): ReactElement {
  const [mode, setMode] = useState<Mode>("");
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<InterruptionKind>("internal");
  const close = () => {
    setMode("");
    setValue("");
  };
  return (
    <>
      <Frame state="capture-pad-saves" width={300} height={72}>
        <Button onClick={() => setMode("saves")}>Open the capture pad</Button>
      </Frame>
      <Frame state="capture-pad-fails" width={300} height={72}>
        <Button onClick={() => setMode("fails")}>Open a capture pad that cannot save</Button>
      </Frame>
      {mode ? (
        <CapturePad
          value={value}
          kind={kind}
          onChange={setValue}
          onKindChange={setKind}
          onSave={() => (mode === "fails" ? Promise.reject(new Error("offline")) : undefined)}
          onClose={close}
        />
      ) : null}
    </>
  );
}
