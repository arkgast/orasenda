import type { ReactElement } from "react";
import { useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button.tsx";
import { Dialog } from "./dialog.tsx";

type Kind = "plain" | "destructive" | "scrim" | "loading";

const cases: { kind: Kind; label: string }[] = [
  { kind: "plain", label: "Open a confirmation" },
  { kind: "destructive", label: "Open a destructive confirmation" },
  { kind: "scrim", label: "Open a scrim confirmation" },
  { kind: "loading", label: "Open a loading confirmation" },
];

export function DialogSpecimen(): ReactElement {
  const [open, setOpen] = useState<Kind | "">("");
  const close = () => setOpen("");
  return (
    <>
      {cases.map((c) => (
        <Frame key={c.kind} state={`dialog-${c.kind}`} width={300} height={72}>
          <Button onClick={() => setOpen(c.kind)}>{c.label}</Button>
        </Frame>
      ))}
      {open === "plain" ? (
        <Dialog
          title="Save this preset?"
          description="Your next session starts with it."
          confirmLabel="Save preset"
          onCancel={close}
          onConfirm={close}
        />
      ) : null}
      {open === "destructive" ? (
        <Dialog
          destructive
          title="Delete all tracking data?"
          description="This removes every session on this device. It cannot be undone."
          confirmLabel="Delete data"
          onCancel={close}
          onConfirm={close}
        />
      ) : null}
      {open === "scrim" ? (
        <Dialog
          scrim
          title="Delete your data?"
          description="This removes every session on this device."
          confirmLabel="Delete data"
          cancelLabel="Keep data"
          onCancel={close}
          onConfirm={close}
        />
      ) : null}
      {open === "loading" ? (
        <Dialog
          loading
          title="Move this task?"
          description="The change is saving."
          confirmLabel="Move task"
          onCancel={close}
          onConfirm={close}
        />
      ) : null}
    </>
  );
}
