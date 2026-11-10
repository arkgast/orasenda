import type { ReactElement } from "react";
import { describeShortcut, Kbd } from "../src/index.ts";
import { Frame } from "./Frame.tsx";

const key = (keys: string): ReactElement => (
  <Kbd keys={keys} spoken={describeShortcut(keys).spoken} />
);

export function KbdSpecimen(): ReactElement {
  return (
    <>
      <Frame state="kbd-running-text" width={420} height={48}>
        <p>Press {key("⌃⌥F")} to capture a thought.</p>
      </Frame>
      <Frame state="kbd-single-key" width={200} height={48}>
        <p>Preset {key("P")}</p>
      </Frame>
      <Frame state="kbd-command-period" width={200} height={48}>
        <p>End {key("⌘.")}</p>
      </Frame>
      <Frame state="kbd-shift-command" width={240} height={48}>
        <p>Palette {key("⇧⌘P")}</p>
      </Frame>
    </>
  );
}
