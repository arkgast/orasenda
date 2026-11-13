import type { JSX, KeyboardEvent } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { describeShortcut } from "../../lib/shortcuts";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";

export interface ShortcutRecorderProps {
  /** The row's label, drawn above the field and the first part of its name ("Start or pause focus from anywhere"). */
  label: string;
  /** The name a screen reader hears in place of `label` ("Full screen, In Orasenda"), for a row whose slots share a visible label. */
  accessibleName?: string;
  /** One canonical glyph string ("⌃⌥F"). Omit it for off. */
  keys?: string;
  /** The keys in words. Defaults to describeShortcut(keys).spoken. */
  spokenKeys?: string;
  /** Starts the field in the recording state. Return, Space or a click also start it; Esc, a record or leaving the field ends it. */
  recording?: boolean;
  /** The host's line when the keys clash ("Orasenda uses ⌘K for Commands. Pick a different one."). The host decides; the recorder never does. */
  conflict?: string;
  /** Shown (and spoken) when `keys` is omitted. Defaults to "None". */
  emptyLabel?: string;
  /**
   * A well-known key the host wants confirmed. The recorder shows "<reason> Use it everywhere anyway?"
   * with "Pick another" first (it has focus) and "Use anyway".
   */
  warning?: { reason: string; onUseAnyway: () => void; onPickAnother: () => void };
  /** The In Orasenda slot: only ⌘ or ⌃ count as a modifier (⌥ alone is a typing key there), and the lines say so. */
  appOnly?: boolean;
  /** A canonical glyph string, or null when the person turned the shortcut off (Delete). */
  onRecord: (keys: string | null) => void;
  onRestoreDefault?: () => void;
  /** Called with true when recording starts and false when it ends in any way (record, Esc, blur, unmount), so the host can suspend its shortcuts while the field listens. */
  onRecordingChange?: (on: boolean) => void;
  id?: string;
}

/** Shown, politely, when a key without ⌘, ⌃ or ⌥ is pressed. Recording continues. */
export const NEEDS_MODIFIER = "Add ⌘, ⌃ or ⌥. A single key can't be a shortcut.";
/** The same for the In Orasenda slot. */
export const NEEDS_MODIFIER_APP = "Add ⌘ or ⌃. A single key can't be a shortcut.";

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

/** True for a press of a key a shortcut could use, when it has no ⌘, ⌃ or ⌥. */
function missingModifier(event: KeyboardEvent, appOnly: boolean): boolean {
  return (
    !MODIFIER_CODES.test(event.code) &&
    keyFor(event.code) !== null &&
    !(event.metaKey || event.ctrlKey || (!appOnly && event.altKey))
  );
}

/** The glyph string for a press, or null when it is not a shortcut yet (a modifier alone, an unknown key, or no ⌘, ⌃ or ⌥). Modifiers come out in the order ⌃⌥⇧⌘. */
function recorded(event: KeyboardEvent, appOnly: boolean): string | null {
  if (MODIFIER_CODES.test(event.code)) return null;
  const key = keyFor(event.code);
  if (!key || !(event.metaKey || event.ctrlKey || (!appOnly && event.altKey))) return null;
  return `${event.ctrlKey ? "⌃" : ""}${event.altKey ? "⌥" : ""}${event.shiftKey ? "⇧" : ""}${event.metaKey ? "⌘" : ""}${key}`;
}

/**
 * Records the global shortcut that starts or pauses focus. A field-like button: Return, Space or a click
 * starts recording; a press with ⌘, ⌃ or ⌥ plus a key calls `onRecord` with its canonical glyph string; Esc
 * cancels; Delete alone calls `onRecord(null)`. The name is composed with aria-labelledby (label, spoken
 * keys, hint); the conflict line is linked with aria-describedby and is not live. A plain key (no ⌘, ⌃ or ⌥)
 * shows a polite message line and recording continues.
 */
export function ShortcutRecorder({
  label,
  accessibleName,
  keys,
  spokenKeys,
  recording = false,
  conflict,
  emptyLabel = "None",
  warning,
  appOnly = false,
  onRecord,
  onRestoreDefault,
  onRecordingChange,
  id,
}: ShortcutRecorderProps): JSX.Element {
  const generated = useId();
  const fieldId = id || generated;
  const [active, setActive] = useState(recording);
  const [message, setMessage] = useState("");
  useEffect(() => setActive(recording), [recording]);
  // The host hears true once per recording and false once, sent before the result is handed on.
  const reported = useRef(false);
  const notify = useRef(onRecordingChange);
  useLayoutEffect(() => {
    notify.current = onRecordingChange;
  });
  const report = useCallback((on: boolean) => {
    if (reported.current === on) return;
    reported.current = on;
    notify.current?.(on);
  }, []);
  useEffect(() => {
    report(active);
  }, [active, report]);
  useEffect(() => () => report(false), [report]);
  function start() {
    setMessage("");
    setActive(true);
  }
  function stop() {
    report(false);
    setActive(false);
  }
  const spoken = keys ? (spokenKeys ?? describeShortcut(keys).spoken) : emptyLabel;
  const field = useRef<HTMLButtonElement>(null);
  const choices = useRef<HTMLDivElement>(null);
  // The safe choice has focus when the question appears.
  const asking = warning !== undefined;
  useEffect(() => {
    if (asking) choices.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [asking]);
  const hint = active ? "Type keys, Esc cancels" : "Change";
  const describedBy = [
    conflict ? `${fieldId}-conflict` : "",
    `${fieldId}-message`,
    `${fieldId}-helper`,
  ]
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
        start();
      }
      return;
    }
    const plain = !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey);
    // Tab and Shift-Tab leave the field (blur ends recording); everything else belongs to the recorder.
    if (event.code === "Tab" && !(event.metaKey || event.ctrlKey || event.altKey)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      stop();
      return;
    }
    if (event.code === "Backspace" && plain) {
      stop();
      onRecord(null);
      return;
    }
    const glyphs = recorded(event, appOnly);
    if (glyphs === null) {
      setMessage(
        missingModifier(event, appOnly) ? (appOnly ? NEEDS_MODIFIER_APP : NEEDS_MODIFIER) : "",
      );
      return;
    }
    stop();
    onRecord(glyphs);
  }

  return (
    <div data-slot="shortcut-recorder" className="flex min-w-0 max-w-panel-width flex-col gap-2">
      <span id={`${fieldId}-label`} data-slot="field-label" className="text-body-sm text-ink">
        {label}
      </span>
      {accessibleName ? (
        <span id={`${fieldId}-name`} hidden>
          {accessibleName}
        </span>
      ) : null}
      <button
        type="button"
        id={fieldId}
        ref={field}
        data-slot="shortcut-recorder-field"
        data-recording={active ? "true" : undefined}
        data-conflict={conflict ? "true" : undefined}
        aria-labelledby={`${fieldId}-${accessibleName ? "name" : "label"} ${fieldId}-keys ${fieldId}-hint`}
        aria-describedby={describedBy}
        onClick={start}
        onBlur={stop}
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
            {keys ?? emptyLabel}
          </span>
          <span className="sr-only">{spoken}</span>
        </span>
        <span
          id={`${fieldId}-hint`}
          className="shrink-0 whitespace-nowrap text-body-sm text-ink-muted"
        >
          {hint}
        </span>
      </button>
      {conflict ? (
        <p
          id={`${fieldId}-conflict`}
          data-slot="field-error"
          className="m-0 flex items-baseline gap-2 text-body-sm text-ink-muted"
        >
          <Icon name="alert" size="md" />
          {conflict}
        </p>
      ) : null}
      <div className="grid">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1 text-body-sm">
          &nbsp;
          <br />
          &nbsp;
        </span>
        <p
          id={`${fieldId}-message`}
          data-slot="shortcut-recorder-message"
          aria-live="polite"
          className="col-start-1 row-start-1 m-0 text-body-sm text-ink"
        >
          {warning ? `${warning.reason} Use it everywhere anyway?` : active ? message : ""}
        </p>
      </div>
      {warning ? (
        <div ref={choices} data-slot="shortcut-recorder-warning" className="flex flex-wrap gap-2">
          <Button
            variant="quiet"
            aria-describedby={`${fieldId}-message`}
            onClick={() => {
              warning.onPickAnother();
              field.current?.focus();
            }}
          >
            Pick another
          </Button>
          <Button
            variant="ghost"
            aria-describedby={`${fieldId}-message`}
            onClick={() => {
              warning.onUseAnyway();
              field.current?.focus();
            }}
          >
            Use anyway
          </Button>
        </div>
      ) : null}
      <p
        id={`${fieldId}-helper`}
        data-slot="field-helper"
        className="m-0 text-body-sm text-ink-muted"
      >
        {appOnly
          ? "A shortcut needs Command or Control plus a key. Delete turns it off."
          : "A shortcut needs Command, Control or Option plus a key. Delete turns it off."}
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
