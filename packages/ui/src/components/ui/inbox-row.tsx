import { type JSX, type KeyboardEvent, useId, useRef, useState } from "react";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { PopoverMenu } from "./popover-menu";

type MenuProps =
  | { onMoveToBoard?: undefined; moreName?: undefined }
  | {
      /** Moves the note to the Board. With it, the end of the row is a "More actions" menu (Move to Board, Remove). */
      onMoveToBoard: () => void;
      /** The menu button's name ("More actions for Ask Sam about the invoice"). Required with onMoveToBoard. */
      moreName: string;
    };

export type InboxRowProps = MenuProps & {
  /** The note. It wraps and is never truncated. */
  text: string;
  kind: "internal" | "external";
  /** The time as shown ("09:41"). */
  time: string;
  /** The time in words for VoiceOver ("Captured at 9:41 AM"). */
  timeLabel: string;
  onRemove: () => void;
  /** The Remove button's name ("Remove note: Ask Sam about the invoice"). */
  removeName: string;
  /** Makes the row focusable. The host owns the roving: 0 for the active row, -1 for the others. Omitted: not focusable. */
  tabIndex?: 0 | -1;
  /** The More actions button's tab index. A row that roves passes -1, so the row is one tab stop and ⇧F10 or ContextMenu opens its menu. Default 0. Ignored without a menu. */
  menuTabIndex?: 0 | -1;
  /** Keys pressed on the row (or in it); the host handles ↑/↓ and the rest. */
  onKeyDown?: (event: KeyboardEvent<HTMLLIElement>) => void;
};

const KIND_WORD = { internal: "Internal", external: "External" } as const;

/** One captured note in the Inbox list. The host provides the surrounding list. */
export function InboxRow({
  text,
  kind,
  time,
  timeLabel,
  onRemove,
  removeName,
  onMoveToBoard,
  moreName,
  tabIndex,
  menuTabIndex = 0,
  onKeyDown,
}: InboxRowProps): JSX.Element {
  const [open, setOpen] = useState(false);
  // Opened by key: focus returns to the row, not the More button. The flag also marks the native contextmenu
  // that WebView2 sends after a keyboard Shift+F10, which must not open a second, native menu.
  const [byKey, setByKey] = useState(false);
  const keyOpened = useRef(false);
  const row = useRef<HTMLLIElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const menuId = `${useId()}-menu`;
  const withMenu = onMoveToBoard !== undefined;
  const keyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    const menuKey =
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey);
    if (withMenu && menuKey && event.target === event.currentTarget) {
      event.preventDefault();
      keyOpened.current = true;
      if (!open) {
        setByKey(true);
        setOpen(true);
      }
    }
    onKeyDown?.(event);
  };
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the host's roving list handles ↑/↓ on the row
    <li
      ref={row}
      data-slot="inbox-row"
      data-kind={kind}
      tabIndex={tabIndex}
      onKeyDown={keyDown}
      onContextMenu={(event) => {
        if (!keyOpened.current) return;
        keyOpened.current = false;
        event.preventDefault();
      }}
      className="flex min-h-hit-min list-none items-start justify-between gap-3 border-b border-line py-2 pe-1"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 whitespace-pre-wrap break-words text-body text-ink">{text}</p>
        <p data-slot="inbox-row-meta" className="m-0 text-body-sm text-ink-muted">
          {KIND_WORD[kind]} ·{" "}
          <span aria-hidden="true" className="tabular-nums">
            {time}
          </span>
          <span className="sr-only">{timeLabel}</span>
        </p>
      </div>
      {withMenu ? (
        <>
          <span ref={anchor} className="flex-none">
            <IconButton
              label={moreName}
              icon={<Icon name="menu" />}
              shortcut="⇧F10"
              tabIndex={menuTabIndex}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              onClick={() => {
                keyOpened.current = false;
                setByKey(false);
                setOpen((v) => !v);
              }}
            />
          </span>
          {open ? (
            <PopoverMenu
              id={menuId}
              heading="This note"
              items={[
                { id: "move", label: "Move to Board", kind: "link" },
                { id: "remove", label: "Remove", kind: "link" },
              ]}
              onSelect={(id) => (id === "move" ? onMoveToBoard : onRemove)?.()}
              onClose={() => {
                setOpen(false);
                setByKey(false);
                keyOpened.current = false;
              }}
              anchor={anchor}
              returnFocus={byKey ? row : undefined}
            />
          ) : null}
        </>
      ) : (
        <IconButton label={removeName} icon={<Icon name="close" />} onClick={onRemove} />
      )}
    </li>
  );
}
