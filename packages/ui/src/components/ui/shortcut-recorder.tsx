import type { JSX, KeyboardEvent } from "react";
import { useEffect, useId, useState } from "react";
import { describeShortcut } from "../../lib/shortcuts";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { AlertGlyph } from "./glyphs";

export interface ShortcutRecorderProps {
  /** The row's label, drawn above the field and the first part of its name ("Start or pause focus from anywhere"). */
  label: string;
  /** One canonical glyph string ("⌃⌥F"). Omit it for off. */
  keys?: string;
  /** The keys in words. Defaults to describeShortcut(keys).spoken. */
  spokenKeys?: string;
  /** Starts the field in the recording state. Return, Space or a click also start it; Esc, a record or leaving the field ends it. */
  recording?: boolean;
  /** The host's line when the keys clash ("Orasenda uses ⌘K for Commands. Pick a different one."). The host decides; the recorder never does. */
  conflict?: string;
  /** A canonical glyph string, or null when the person turned the shortcut off (Delete). */
  onRecord: (keys: string | null) => void;
  onRestoreDefault?: () => void;
  id?: string;
}

// Built from its code point: the copy guard reads the return arrow as an emoji, and the formatter rewrites an escape.
const RETURN = String.fromCharCode(0x21a9);

// KeyboardEvent.code reads the physical key, so Option-F is still F. Each value is a key from the Kbd key table.
const NAMED: Readonly<Record<string, string>> = {
  Period: ".",
  Comma: ",",
  Enter: RETURN,
  NumpadEnter: RETURN,
  Space: "Space",
  Tab: "Tab",
  ArrowLeft: "←",
  ArrowUp: "↑",
  ArrowRight: "→",
  ArrowDown: "↓",
  Backspace: "⌫",
};
const MODIFIER_CODES = /^(Meta|Control|Alt|Shift|CapsLock|Fn)(Left|Right)?$/;

function keyFor(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code) ?? /^Digit([0-9])$/.exec(code);
  if (letter) return letter[1];
  return Object.hasOwn(NAMED, code) ? NAMED[code] : null;
}

/** The glyph string for a press, or null when it is not a shortcut yet (a modifier alone, an unknown key, or no ⌘, ⌃ or ⌥). Modifiers come out in the order ⌃⌥⇧⌘. */
function recorded(event: KeyboardEvent): string | null {
  if (MODIFIER_CODES.test(event.code)) return null;
  const key = keyFor(event.code);
  if (!key || !(event.metaKey || event.ctrlKey || event.altKey)) return null;
  return `${event.ctrlKey ? "⌃" : ""}${event.altKey ? "⌥" : ""}${event.shiftKey ? "⇧" : ""}${event.metaKey ? "⌘" : ""}${key}`;
}

/**
 * Records the global shortcut that starts or pauses focus. A field-like button: Return, Space or a click
 * starts recording; a press with ⌘, ⌃ or ⌥ plus a key calls `onRecord` with its canonical glyph string; Esc
 * cancels; Delete alone calls `onRecord(null)`. The name is composed with aria-labelledby (label, spoken
 * keys, hint); the conflict line is linked with aria-describedby and is not live.
 */
export function ShortcutRecorder({
  label,
  keys,
  spokenKeys,
  recording = false,
  conflict,
  onRecord,
  onRestoreDefault,
  id,
}: ShortcutRecorderProps): JSX.Element {
  const generated = useId();
  const fieldId = id || generated;
  const [active, setActive] = useState(recording);
  useEffect(() => setActive(recording), [recording]);
  const spoken = keys ? (spokenKeys ?? describeShortcut(keys).spoken) : "Off";
  const hint = active ? "Type the new keys, Esc cancels" : "Change";
  const describedBy = [conflict ? `${fieldId}-conflict` : "", `${fieldId}-helper`]
    .filter(Boolean)
    .join(" ");

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!active) {
      if (
        event.code === "Enter" ||
        event.code === "Space" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        setActive(true);
      }
      return;
    }
    const plain = !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey);
    // Plain Tab leaves the field (blur ends recording); everything else belongs to the recorder.
    if (event.code === "Tab" && plain) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      setActive(false);
      return;
    }
    if (event.code === "Backspace" && plain) {
      setActive(false);
      onRecord(null);
      return;
    }
    const glyphs = recorded(event);
    if (glyphs === null) return;
    setActive(false);
    onRecord(glyphs);
  }

  return (
    <div data-slot="shortcut-recorder" className="flex min-w-0 max-w-panel-width flex-col gap-2">
      <span id={`${fieldId}-label`} data-slot="field-label" className="text-body-sm text-ink">
        {label}
      </span>
      <button
        type="button"
        id={fieldId}
        data-slot="shortcut-recorder-field"
        data-recording={active ? "true" : undefined}
        data-conflict={conflict ? "true" : undefined}
        aria-labelledby={`${fieldId}-label ${fieldId}-keys ${fieldId}-hint`}
        aria-describedby={describedBy}
        onClick={() => setActive(true)}
        onBlur={() => setActive(false)}
        onKeyDown={onKeyDown}
        className={cn(
          "flex min-h-hit-min w-full min-w-field-width cursor-pointer items-center justify-between gap-3 rounded-sm border border-line-strong bg-surface-sunken px-3 py-2 text-start text-body text-ink",
          "hover:border-focus",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          "data-[conflict=true]:ring-1 data-[conflict=true]:ring-inset data-[conflict=true]:ring-line-strong",
          "data-[recording=true]:border-focus data-[recording=true]:bg-selection",
        )}
      >
        <span id={`${fieldId}-keys`} className="min-w-0">
          <span aria-hidden="true" className="font-mono text-kbd tabular-nums">
            {keys ?? "Off"}
          </span>
          <span className="sr-only">{spoken}</span>
        </span>
        <span id={`${fieldId}-hint`} className="text-body-sm text-ink-muted">
          {hint}
        </span>
      </button>
      {conflict ? (
        <p
          id={`${fieldId}-conflict`}
          data-slot="field-error"
          className="m-0 flex items-baseline gap-2 text-body-sm text-ink-muted"
        >
          <AlertGlyph />
          {conflict}
        </p>
      ) : null}
      <p
        id={`${fieldId}-helper`}
        data-slot="field-helper"
        className="m-0 text-body-sm text-ink-muted"
      >
        A shortcut needs Command, Control or Option plus a key. Delete turns it off.
      </p>
      {onRestoreDefault ? (
        <div>
          <Button variant="ghost" onClick={onRestoreDefault}>
            Restore default
          </Button>
        </div>
      ) : null}
    </div>
  );
}
