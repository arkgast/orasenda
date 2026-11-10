import { type ReactElement, useState } from "react";
import { Button, Dialog, describeShortcut, IconButton, Tooltip } from "../index.ts";
import { Frame } from "./Frame.tsx";
import { Stop } from "./icons.tsx";

export function TooltipSpecimen(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Frame state="tooltip-preset-summary" width={360} height={140}>
        <Tooltip label="Change preset" shortcut="P">
          <Button
            variant="ghost"
            aria-label="Classic, ends 15:20, Change preset"
            aria-keyshortcuts={describeShortcut("P").aria}
          >
            Classic · ends 15:20
          </Button>
        </Tooltip>
      </Frame>
      <Frame state="tooltip-long-label" width={480} height={160}>
        <IconButton
          label="Jump to section, the list of settings sections on this page, in order"
          icon={<Stop />}
          shortcut="⌘J"
        />
      </Frame>
      <Frame state="tooltip-dialog" width={360} height={80}>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
      </Frame>
      {open ? (
        <Dialog
          title="Leave full screen"
          description="Your focus session keeps running."
          confirmLabel="Leave full screen"
          cancelLabel="Stay in full screen"
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        >
          <IconButton label="End session" icon={<Stop />} shortcut="⌘." />
        </Dialog>
      ) : null}
    </>
  );
}
