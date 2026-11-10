import { type ReactElement, type RefObject, useRef, useState } from "react";
import {
  Button,
  Dialog,
  describeShortcut,
  IconButton,
  PopoverMenu,
  type PopoverMenuItem,
  Tooltip,
} from "../src/index.ts";
import { Frame } from "./Frame.tsx";
import { Menu } from "./icons.tsx";

const PRESETS: [string, string, string][] = [
  ["classic", "Classic", "25 / 5"],
  ["deep", "Deep Block", "90 / 15"],
  ["short", "Short", "15 / 3"],
  ["custom", "Custom", "50 / 10"],
];

function presetItems(current: string, withSettings: boolean): PopoverMenuItem[] {
  const rows: PopoverMenuItem[] = PRESETS.map(([id, label, meta]) => ({
    id,
    label,
    meta,
    kind: "radio",
    checked: id === current,
  }));
  return withSettings
    ? [...rows, { id: "settings", label: "Timer settings…", kind: "link" }]
    : rows;
}

const nameOf = (id: string): string => PRESETS.find((p) => p[0] === id)?.[1] ?? "Classic";

type Key = "today" | "readOnly" | "focusWindow" | "checkbox" | "dialog" | "edgeEnd" | "edge";

export function PopoverMenuSpecimen(): ReactElement {
  const [open, setOpen] = useState<Key | "">("");
  const [preset, setPreset] = useState("classic");
  const [checks, setChecks] = useState<Record<string, boolean>>({ a: true, b: false });
  const [dialog, setDialog] = useState(false);
  const [last, setLast] = useState("Nothing chosen yet.");
  const today = useRef<HTMLSpanElement>(null);
  const readOnly = useRef<HTMLSpanElement>(null);
  const focusWindow = useRef<HTMLSpanElement>(null);
  const checkbox = useRef<HTMLSpanElement>(null);
  const inDialog = useRef<HTMLSpanElement>(null);
  const edgeEnd = useRef<HTMLSpanElement>(null);
  const edge = useRef<HTMLSpanElement>(null);

  const close = () => setOpen("");
  const pick = (id: string) => {
    if (id === "settings") setLast("Timer settings would open here.");
    else {
      setPreset(id);
      setLast(`${nameOf(id)} chosen.`);
    }
  };
  const aria = (key: Key) => ({
    "aria-haspopup": "menu" as const,
    "aria-expanded": open === key,
    "aria-controls": open === key ? `pm-${key}` : undefined,
    onClick: () => setOpen(open === key ? "" : key),
  });
  const menu = (
    key: Key,
    anchor: RefObject<HTMLElement | null>,
    props: Omit<Parameters<typeof PopoverMenu>[0], "id" | "anchor" | "onClose" | "onSelect"> & {
      onSelect?: (id: string) => void;
    },
  ) =>
    open === key ? (
      <PopoverMenu id={`pm-${key}`} anchor={anchor} onClose={close} onSelect={pick} {...props} />
    ) : null;
  const glyph = <Menu />;
  const summary = `${nameOf(preset)} · ends 15:20`;

  return (
    <>
      <Frame state="popover-menu-today" width={360} height={96}>
        <span ref={today} style={{ display: "inline-flex" }}>
          <Tooltip label="Change preset" shortcut="P">
            <Button
              variant="ghost"
              aria-label={`${summary}, Change preset`}
              aria-keyshortcuts={describeShortcut("P").aria}
              {...aria("today")}
            >
              {summary}
            </Button>
          </Tooltip>
        </span>
        {menu("today", today, {
          heading: "Preset",
          items: presetItems(preset, true),
          singleKeys: true,
        })}
      </Frame>
      <Frame state="popover-menu-read-only" width={360} height={96}>
        <span ref={readOnly} style={{ display: "inline-flex" }}>
          <IconButton label="Preset while a session runs" icon={glyph} {...aria("readOnly")} />
        </span>
        {menu("readOnly", readOnly, {
          heading: "Classic · 25 / 5",
          description: "Presets can change between sessions.",
          items: presetItems("classic", true),
          readOnly: true,
        })}
      </Frame>
      <Frame state="popover-menu-focus-window" width={360} height={96}>
        <span ref={focusWindow} style={{ display: "inline-flex" }}>
          <IconButton label="Preset for the next session" icon={glyph} {...aria("focusWindow")} />
        </span>
        {menu("focusWindow", focusWindow, {
          heading: "Preset for the next session",
          description: "Choosing one applies it and closes.",
          items: presetItems(preset, false),
        })}
      </Frame>
      <Frame state="popover-menu-checkbox" width={360} height={96}>
        <span ref={checkbox} style={{ display: "inline-flex" }}>
          <IconButton label="Checkbox rows" icon={glyph} {...aria("checkbox")} />
        </span>
        {menu("checkbox", checkbox, {
          heading: "Checkbox rows",
          description: "Choosing one toggles it and closes.",
          items: [
            { id: "a", label: "First option", kind: "checkbox", checked: checks.a },
            { id: "b", label: "Second option", kind: "checkbox", checked: checks.b },
            { id: "c", label: "Unavailable option", kind: "checkbox", disabled: true },
          ],
          onSelect: (id) => {
            setChecks({ ...checks, [id]: !checks[id] });
            setLast(`${id === "a" ? "First" : "Second"} option toggled.`);
          },
        })}
      </Frame>
      <Frame state="popover-menu-dialog" width={360} height={96}>
        <Button onClick={() => setDialog(true)}>Open a dialog</Button>
      </Frame>
      {dialog ? (
        <Dialog
          title="Leave full screen?"
          description="Your focus session will keep running."
          confirmLabel="Leave full screen"
          cancelLabel="Stay in full screen"
          onCancel={() => {
            close();
            setDialog(false);
          }}
          onConfirm={() => {
            close();
            setDialog(false);
          }}
        >
          <span ref={inDialog} style={{ display: "inline-flex" }}>
            <IconButton label="Preset in the dialog" icon={glyph} {...aria("dialog")} />
          </span>
          {menu("dialog", inDialog, {
            heading: "Preset for the next session",
            description: "Choosing one applies it and closes.",
            items: presetItems(preset, false),
          })}
        </Dialog>
      ) : null}
      <Frame state="popover-menu-edge-end" width={360} height={96}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span ref={edgeEnd} style={{ display: "inline-flex" }}>
            <IconButton label="Preset at the end" icon={glyph} {...aria("edgeEnd")} />
          </span>
        </div>
        {menu("edgeEnd", edgeEnd, {
          heading: "Preset for the next session",
          items: presetItems(preset, false),
        })}
      </Frame>
      <p>{last}</p>
      <Frame state="popover-menu-edge" width={360} height={240}>
        <div style={{ display: "flex", alignItems: "flex-end", height: "100%" }}>
          <span ref={edge} style={{ display: "inline-flex" }}>
            <IconButton label="Preset at the bottom" icon={glyph} {...aria("edge")} />
          </span>
        </div>
        {menu("edge", edge, { heading: "Preset", items: presetItems(preset, true) })}
      </Frame>
    </>
  );
}
