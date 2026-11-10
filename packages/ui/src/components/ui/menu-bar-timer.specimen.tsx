import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { MenuBarTimer } from "./menu-bar-timer.tsx";

const RUN = { remaining: "18:42", remainingLabel: "18 minutes 42 seconds", progress: 0.25 };
const TASK = "Finish the chapter 3 outline and send the draft to Maya before the review";

export function MenuBarTimerSpecimen(): ReactElement {
  return (
    <>
      <Frame state="menu-bar-timer-focus" width={200} height={40}>
        <MenuBarTimer {...RUN} mode="focus" />
      </Frame>
      <Frame state="menu-bar-timer-warning" width={200} height={40}>
        <MenuBarTimer remaining="01:48" remainingLabel="1 minute 48 seconds" mode="warning" />
      </Frame>
      <Frame state="menu-bar-timer-break" width={200} height={40}>
        <MenuBarTimer remaining="05:00" remainingLabel="5 minutes" mode="break" />
      </Frame>
      <Frame state="menu-bar-timer-paused" width={200} height={40}>
        <MenuBarTimer {...RUN} mode="paused" />
      </Frame>
      <Frame state="menu-bar-timer-idle" width={200} height={40}>
        <MenuBarTimer mode="idle" />
      </Frame>
      <Frame state="menu-bar-timer-floating-focus" width={280} height={56}>
        <MenuBarTimer {...RUN} mode="focus" compact={false} task={TASK} />
      </Frame>
      <Frame state="menu-bar-timer-floating-paused" width={280} height={56}>
        <MenuBarTimer {...RUN} mode="paused" compact={false} task="Write chapter" />
      </Frame>
    </>
  );
}
