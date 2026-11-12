import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { isTopmostLayer } from "../../lib/layer";
import { describeShortcut } from "../../lib/shortcuts";
import { cn } from "../../lib/utils";
import type { Command as CommandEntry } from "../../types";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { Kbd } from "./kbd";

// WebKit does not focus a button on click, so remember the last pressed button as the opener fallback (same
// approach as Dialog). A press only counts while fresh, and any key press clears it.
const PRESS_TTL_MS = 1000;
let lastPress: { el: HTMLElement; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("button");
      lastPress = el ? { el, at: Date.now() } : null;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    () => {
      lastPress = null;
    },
    true,
  );
}

export interface CommandPaletteProps {
  open?: boolean;
  commands: CommandEntry[];
  onSelect: (id: string) => void;
  onClose: () => void;
  /** The host sets it below layout-compact-height: the title and label are visually hidden and a Close IconButton sits beside the field. */
  compact?: boolean;
}

// Interim close mark on the 20-unit grid, replaced by Icon in T7.
function CloseMark() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

const panel =
  "flex max-h-full w-full max-w-panel-width flex-col overflow-hidden rounded-lg border border-line-strong bg-surface-overlay text-ink shadow-overlay";
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

/**
 * The command palette: a search field over a list of commands. Mount a fresh instance per invocation so the
 * query starts empty. `onSelect(id)` runs before `onClose`; Escape and Close call `onClose`; backdrop clicks never dismiss.
 */
export function CommandPalette({
  open = true,
  commands,
  onSelect,
  onClose,
  compact = false,
}: CommandPaletteProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const needle = query.toLowerCase().trim();
  const results = commands.filter((c) =>
    `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(needle),
  );
  // cmdk reports its highlighted row through onValueChange only while `value` is controlled; it starts empty so cmdk picks the first row itself.
  const selected = results.some((c) => c.id === value) ? value : "";
  // cmdk fills aria-activedescendant only after its second render, so the first row is not announced on open: keep it in step here.
  useEffect(() => {
    const row = selected
      ? Array.from(contentRef.current?.querySelectorAll<HTMLElement>("[cmdk-item]") ?? []).find(
          (el) => el.getAttribute("data-value") === selected,
        )
      : undefined;
    const input = inputRef.current;
    if (!input) return;
    if (row) input.setAttribute("aria-activedescendant", row.id);
    else input.removeAttribute("aria-activedescendant");
  }, [selected]);
  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          className="fixed inset-0 z-overlay grid place-items-center bg-clear p-3"
        >
          <DialogPrimitive.Content
            aria-modal="true"
            aria-describedby={undefined}
            // layer.ts finds open layers by this slot, so Esc and portals treat the palette like a Dialog.
            data-slot="dialog-content"
            ref={contentRef}
            className={cn(panel, compact ? "gap-2 p-3" : "gap-5 p-5")}
            onOpenAutoFocus={(event) => {
              const active = document.activeElement as HTMLElement | null;
              const press =
                lastPress && Date.now() - lastPress.at <= PRESS_TTL_MS ? lastPress.el : null;
              opener.current = active && active !== document.body ? active : press;
              event.preventDefault();
              inputRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (contentRef.current && !isTopmostLayer(contentRef.current)) event.preventDefault();
            }}
          >
            <DialogPrimitive.Title
              data-slot="dialog-title"
              className={cn("m-0 text-title text-ink", compact && "sr-only")}
            >
              Commands
            </DialogPrimitive.Title>
            <Command
              label="Search commands"
              value={value}
              shouldFilter={false}
              loop
              disablePointerSelection
              vimBindings={false}
              onValueChange={setValue}
              className="flex min-h-0 flex-col gap-2"
            >
              <span
                aria-hidden="true"
                data-slot="field-label"
                className={cn("text-body-sm text-ink", compact && "sr-only")}
              >
                Search commands
              </span>
              <div className="flex items-center gap-2">
                <Command.Input
                  ref={inputRef}
                  data-slot="input"
                  value={query}
                  onValueChange={setQuery}
                  // cmdk jumps to the first or last row on Home and End; keep them moving the caret as in a plain field.
                  onKeyDown={(event) => {
                    if (event.key === "Home" || event.key === "End") event.stopPropagation();
                  }}
                  className={cn(
                    "block min-h-hit-min min-w-0 flex-1 rounded-sm border border-line-strong bg-surface-sunken px-3 py-2 font-sans text-body text-ink",
                    "hover:border-focus",
                    focusRing,
                  )}
                />
                {compact ? (
                  <IconButton label="Close" icon={<CloseMark />} onClick={onClose} />
                ) : null}
              </div>
              <Command.List
                label="Commands"
                className="flex min-h-0 flex-col gap-1 overflow-auto p-1"
              >
                {results.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={c.id}
                    onSelect={() => choose(c.id)}
                    onMouseDown={(event) => event.preventDefault()}
                    data-slot="command-palette-item"
                    className={cn(
                      "relative flex min-h-hit-min cursor-pointer items-start justify-between gap-3 rounded-sm border-s-2 border-clear px-3 py-2 text-body",
                      "data-[selected=true]:border-focus data-[selected=true]:bg-selection",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="break-words">{c.label}</span>
                      {c.hint ? <span className="break-words text-ink-muted">{c.hint}</span> : null}
                      {c.id === selected ? (
                        <span aria-hidden="true" className="text-caption text-focus">
                          Selected
                        </span>
                      ) : null}
                    </span>
                    {c.shortcut ? (
                      <span className="shrink-0">
                        <Kbd keys={c.shortcut} spoken={describeShortcut(c.shortcut).spoken} />
                      </span>
                    ) : null}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
            {results.length ? null : (
              <p role="status" className="m-0 text-body text-ink-muted">
                No matching commands. Try a different word.
              </p>
            )}
            {compact ? null : (
              <div data-slot="dialog-actions" className="flex justify-end">
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
