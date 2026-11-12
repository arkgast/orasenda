import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Icon, type IconName } from "./icon.tsx";

const CONTROLS: readonly IconName[] = [
  "play",
  "pause",
  "stop",
  "expand",
  "collapse",
  "window",
  "menu",
  "chevron",
  "close",
  "back",
  "alert",
  "info",
  "pages",
  "jump",
];
const RAIL: readonly IconName[] = ["today", "board", "calendar", "routines", "review", "settings"];

function Sheet({ names }: { names: readonly IconName[] }): ReactElement {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-4 p-4 text-ink">
      {names.map((name) => (
        <li key={name} data-icon={name} className="flex items-center gap-2 text-caption">
          <Icon name={name} />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  );
}

export function IconSpecimen(): ReactElement {
  return (
    <>
      <Frame state="icon-sheet-controls" width={420} height={160}>
        <Sheet names={CONTROLS} />
      </Frame>
      <Frame state="icon-sheet-rail" width={420} height={96}>
        <Sheet names={RAIL} />
      </Frame>
      <Frame state="icon-md-alert" width={140} height={60}>
        <div className="flex items-center gap-2 p-4 text-ink">
          <Icon name="alert" size="md" />
          <span className="text-caption">alert, md</span>
        </div>
      </Frame>
    </>
  );
}
