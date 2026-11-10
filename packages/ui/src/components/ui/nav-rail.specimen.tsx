import { type ReactElement, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import type { NavPage } from "../../types.ts";
import { NavRail } from "./nav-rail.tsx";

const noop = (): void => {};

function StatefulRail(): ReactElement {
  const [current, setCurrent] = useState<NavPage>("today");
  return <NavRail current={current} onNavigate={setCurrent} />;
}

export function NavRailSpecimen(): ReactElement {
  return (
    <>
      <Frame state="nav-rail-today" width={72} height={400}>
        <StatefulRail />
      </Frame>
      <Frame state="nav-rail-settings" width={72} height={400}>
        <NavRail current="settings" onNavigate={noop} />
      </Frame>
    </>
  );
}
