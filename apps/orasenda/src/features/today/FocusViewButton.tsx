import { Icon, IconButton } from "@orasenda/ui";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { DisplayInfo, FocusViewTarget } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";

type Props = {
  onOpen(target: FocusViewTarget): void;
  /** Single keys are on: F opens the menu, and the button says so. */
  singleKeys?: boolean;
  /** Counts F presses from the page; each new count opens the menu. */
  openRequest?: number;
};

async function listDisplays(): Promise<DisplayInfo[]> {
  try {
    return await commands.displaysList();
  } catch (error) {
    console.error("displays_list failed", error);
    return [];
  }
}

function menuItems(displays: DisplayInfo[]) {
  return [
    ...displays.map((display, index) => ({
      id: `fullScreen:${display.id}`,
      label: displays.length === 1 ? "Full screen" : `Full screen on ${display.name}`,
      accelerator: index === 0 ? "Cmd+Shift+F" : null,
      checked: null,
    })),
    {
      id: "floater",
      label: "Floating timer, hide Orasenda",
      accelerator: "Cmd+Shift+T",
      checked: null,
    },
  ];
}

/** Today's Focus view button: a native menu of the full-screen and floating-timer choices. */
export function FocusViewButton({
  onOpen,
  singleKeys = false,
  openRequest = 0,
}: Props): ReactElement | null {
  const box = useRef<HTMLSpanElement>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listDisplays().then((list) => {
      if (!cancelled) setDisplays(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = async () => {
    if (displays.length === 0) return;
    const rect = box.current?.querySelector("button")?.getBoundingClientRect();
    const fresh = await listDisplays();
    setDisplays(fresh);
    if (fresh.length === 0) return;
    setExpanded(true);
    try {
      const chosen = await commands.nativeMenuPopup({
        items: menuItems(fresh),
        x: rect?.left ?? 0,
        y: rect?.bottom ?? 0,
      });
      if (chosen === "floater") onOpen({ kind: "floater" });
      else if (chosen?.startsWith("fullScreen:")) {
        onOpen({ kind: "fullScreen", displayId: chosen.slice("fullScreen:".length) });
      }
    } catch (error) {
      console.error("native_menu_popup failed", error);
    } finally {
      setExpanded(false);
    }
  };

  const seenRequest = useRef(openRequest);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (openRequest === seenRequest.current) return;
    seenRequest.current = openRequest;
    void openRef.current();
  }, [openRequest]);

  if (displays.length === 0) return null;

  return (
    <span ref={box} className="inline-flex">
      <IconButton
        label="Focus view"
        shortcut={singleKeys ? "F" : undefined}
        icon={<Icon name="expand" />}
        aria-haspopup="menu"
        aria-expanded={expanded}
        onClick={open}
      />
    </span>
  );
}
