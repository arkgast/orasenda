import { type ReactElement, useRef, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button, Dialog, describeShortcut, IconButton } from "../../index";
import { Icon } from "./icon.tsx";
import { Tooltip } from "./tooltip";

export function TooltipSpecimen(): ReactElement {
  const [open, setOpen] = useState(false);
  const [cancels, setCancels] = useState(0);
  const [nativeOpen, setNativeOpen] = useState(false);
  const native = useRef<HTMLDialogElement>(null);
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
          icon={<Icon name="stop" />}
          shortcut="⌘J"
        />
      </Frame>
      <Frame state="tooltip-dialog" width={360} height={80}>
        <IconButton label="Open dialog" icon={<Icon name="stop" />} onClick={() => setOpen(true)} />
      </Frame>
      <Frame state="tooltip-native-dialog" width={360} height={80}>
        <Button
          variant="ghost"
          onClick={() => {
            setNativeOpen(true);
            native.current?.showModal();
          }}
        >
          Open native dialog
        </Button>
        {/* A native modal shell (top layer): the tooltip must join it. */}
        <dialog
          ref={native}
          aria-label="Native layer"
          data-cancels={cancels}
          onCancel={() => setCancels((n) => n + 1)}
          onClose={() => setNativeOpen(false)}
        >
          {nativeOpen ? <IconButton label="Native tip" icon={<Icon name="stop" />} /> : null}
        </dialog>
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
          <IconButton label="End session" icon={<Icon name="stop" />} shortcut="⌘." />
        </Dialog>
      ) : null}
    </>
  );
}
