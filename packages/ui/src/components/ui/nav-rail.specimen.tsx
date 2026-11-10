import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { NavRail } from "./nav-rail.tsx";

const noop = (): void => {};

export function NavRailSpecimen(): ReactElement {
  return (
    <>
      <Frame state="nav-rail-today" width={72} height={400}>
        <NavRail current="today" onNavigate={noop} />
      </Frame>
      <Frame state="nav-rail-settings" width={72} height={400}>
        <NavRail current="settings" onNavigate={noop} />
      </Frame>
    </>
  );
}
