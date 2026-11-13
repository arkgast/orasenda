import { CapturePad, type InterruptionKind } from "@orasenda/ui";
import { useTheme } from "@shared/hooks/useTheme";
import { commands, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useEffect, useState } from "react";
import "./capture.css";

const TOO_LONG = "This note is too long to save. Shorten it a little.";

/** Thrown for a rejected save; `tooLong` has its own line, the rest keep the pad's default. */
class SaveRejected extends Error {
  constructor(readonly tooLong: boolean) {
    super("capture_note failed");
  }
}

function rejectionLine(reason: unknown): string | undefined {
  return reason instanceof SaveRejected && reason.tooLong ? TOO_LONG : undefined;
}

/** The pad's text area, wherever the pad's portal put it. */
function focusText(): void {
  document.querySelector<HTMLTextAreaElement>("[data-capture-pad] textarea")?.focus();
}

/**
 * The capture panel's page (`capture.html`): a `CapturePad` that is always open. Rust opens the
 * panel and gives it key focus without activating Orasenda.
 *
 * - Save is `capture_note`. A typed error is thrown so the pad keeps the text and shows its line.
 *   Rust announces "Saved to Inbox." inside `capture_note`, before it answers, because the pad
 *   closes and cannot announce from a closed dialog.
 * - The pad closing (after a save, or Esc on an empty pad) is `capture_close`.
 * - The kind starts at Internal: the window is destroyed on close, so every open is fresh.
 * - A second open (`capture-focus`) and the window taking key focus both focus the text area.
 */
export function CapturePage() {
  useTheme();
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<InterruptionKind>("internal");

  useEffect(() => {
    const stop = subscribe("capture-focus", events.captureFocus.listen, focusText);
    window.addEventListener("focus", focusText);
    return () => {
      stop();
      window.removeEventListener("focus", focusText);
    };
  }, []);

  return (
    <CapturePad
      value={value}
      kind={kind}
      panel
      rejectionLine={rejectionLine}
      onChange={setValue}
      onKindChange={setKind}
      onSave={async (note) => {
        const result = await commands.captureNote(note);
        if (result.status === "error") {
          console.error("capture_note failed", result.error);
          throw new SaveRejected(result.error === "tooLong");
        }
        // Saved. Empty the field before the pad closes, so a failed close can never save it twice.
        setValue("");
      }}
      onClose={() => {
        commands
          .captureClose()
          .catch((error: unknown) => console.error("capture_close failed", error));
      }}
    />
  );
}
