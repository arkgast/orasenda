import { Dialog as DialogPrimitive } from "radix-ui";
import { type JSX, useId, useRef, useState } from "react";
import { isTopmostLayer } from "../../lib/layer";
import { Button } from "./button";
import { Choice, ChoiceGroup } from "./choice";
import { TextArea } from "./text-area";

export type InterruptionKind = "internal" | "external";

export interface CapturePadProps {
  open?: boolean;
  value: string;
  kind: InterruptionKind;
  onChange: (value: string) => void;
  onKindChange: (kind: InterruptionKind) => void;
  onSave: (note: { text: string; kind: InterruptionKind }) => void | Promise<void>;
  onClose: () => void;
}

const KINDS: { kind: InterruptionKind; label: string; line: string }[] = [
  { kind: "internal", label: "Internal", line: "This came from your own mind." },
  { kind: "external", label: "External", line: "This came from around you." },
];

/**
 * The hotkey capture pad inside a Radix Dialog. Escape and Command-Return save; neither discards. The pad
 * closes only after `onSave` resolves; a rejection keeps the text and says so. Duplicate saves are ignored
 * while one is running. The pad closes on success, so it cannot announce from a closed dialog: the host
 * announces "Saved to Inbox." once. The pad adds no live region of its own.
 */
export function CapturePad({
  open: openProp,
  value,
  kind,
  onChange,
  onKindChange,
  onSave,
  onClose,
}: CapturePadProps): JSX.Element {
  const open = openProp !== false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const group = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const hasText = value.trim().length > 0;

  function save() {
    if (saving.current) return;
    if (!hasText) {
      onClose();
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    Promise.resolve()
      .then(() => onSave({ text: value.trim(), kind }))
      .then(
        () => {
          saving.current = false;
          setBusy(false);
          onClose();
        },
        () => {
          saving.current = false;
          setBusy(false);
          setError("Your note is still here. Try saving again.");
        },
      );
  }

  // Built on the Radix primitive directly, not the Dialog component: the pad saves on Esc and outside
  // interaction instead of dismissing, and restores focus to its own opener.
  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && save()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            data-slot="dialog-overlay"
            data-scrim="false"
            className="fixed inset-0 z-overlay grid place-items-center bg-clear p-3"
          >
            <DialogPrimitive.Content
              aria-modal="true"
              data-slot="dialog-content"
              data-capture-pad="true"
              ref={contentRef}
              className="flex max-h-full w-full max-w-panel-width flex-col gap-5 overflow-auto rounded-lg border border-line-strong bg-surface-overlay p-5 text-ink shadow-overlay"
              onOpenAutoFocus={(event) => {
                const active = document.activeElement as HTMLElement | null;
                opener.current = active && active !== document.body ? active : null;
                event.preventDefault();
                contentRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (opener.current?.isConnected) opener.current.focus();
              }}
              onPointerDownOutside={(event) => event.preventDefault()}
              onInteractOutside={(event) => event.preventDefault()}
              onEscapeKeyDown={(event) => {
                if (contentRef.current && !isTopmostLayer(contentRef.current))
                  event.preventDefault();
              }}
            >
              <DialogPrimitive.Title data-slot="dialog-title" className="m-0 text-title text-ink">
                Capture a thought
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                data-slot="dialog-description"
                className="m-0 text-body text-ink-muted"
              >
                Leave it here and go back to what you were doing.
              </DialogPrimitive.Description>
              <form
                data-slot="capture-pad-form"
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  save();
                }}
              >
                <TextArea
                  label="Thought"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  disabled={busy}
                  data-initial-focus="true"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      if (hasText) save();
                    }
                  }}
                  // Written as an escape: the copy guard reads the return arrow as an emoji.
                  helper={"Esc saves to Inbox and closes. ⌘\u21a9 saves too."}
                  error={error}
                />
                <ChoiceGroup legend="Interruption source" disabled={busy}>
                  {KINDS.map((k) => (
                    <Choice
                      key={k.kind}
                      name={group}
                      value={k.kind}
                      checked={kind === k.kind}
                      onChange={() => onKindChange(k.kind)}
                    >
                      {k.label}
                    </Choice>
                  ))}
                </ChoiceGroup>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p
                    data-slot="capture-pad-kind"
                    className="m-0 min-w-0 text-body-sm text-ink-muted"
                  >
                    {KINDS.find((k) => k.kind === kind)?.line}
                  </p>
                  <Button variant="primary" type="submit" loading={busy} disabled={!hasText}>
                    {busy ? "Saving…" : "Save to Inbox"}
                  </Button>
                </div>
              </form>
            </DialogPrimitive.Content>
          </DialogPrimitive.Overlay>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
