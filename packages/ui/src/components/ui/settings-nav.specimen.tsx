import { type ReactElement, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { SettingsNav } from "./settings-nav.tsx";

const ITEMS = [
  { id: "general", name: "General" },
  { id: "timer", name: "Timer" },
  { id: "notifications", name: "Notifications" },
  { id: "keyboard", name: "Shortcuts" },
  { id: "data", name: "Your data" },
  { id: "backups", name: "Backups" },
  { id: "about", name: "About" },
];

function Stateful({ orientation }: { orientation: "vertical" | "horizontal" }): ReactElement {
  const [current, setCurrent] = useState("timer");
  return (
    <SettingsNav items={ITEMS} current={current} onSelect={setCurrent} orientation={orientation} />
  );
}

export function SettingsNavSpecimen(): ReactElement {
  return (
    <>
      <Frame state="settings-nav-vertical" width={240} height={400}>
        <Stateful orientation="vertical" />
      </Frame>
      <Frame state="settings-nav-horizontal-360" width={360} height={120}>
        <Stateful orientation="horizontal" />
      </Frame>
      <Frame state="settings-nav-horizontal-400" width={400} height={120}>
        <Stateful orientation="horizontal" />
      </Frame>
      <Frame state="settings-nav-horizontal-900" width={900} height={120}>
        <Stateful orientation="horizontal" />
      </Frame>
    </>
  );
}
