import type { ReactElement } from "react";
import { InlineNotice, TimerRing } from "../src/index.ts";
import { Frame } from "./Frame.tsx";

// The T1 seed: a ring and the widest status row at 360 wide, plus one frame that overflows on purpose.
export function Seed(): ReactElement {
  return (
    <>
      <Frame state="timer-ring-focus" width={360} height={300}>
        <TimerRing mode="focus" remaining="25:00" progress={0.4} />
      </Frame>
      <Frame state="inline-notice-row-attention" width={360} height={44}>
        <InlineNotice
          variant="row"
          tone="attention"
          actionLabel="Open Settings"
          actionName="Open Settings to change custom minutes"
          onAction={() => {}}
        >
          Focus didn't start. Custom focus needs 5 to 180 minutes.
        </InlineNotice>
      </Frame>
      <Frame state="seeded-overflow" width={120} height={40}>
        <div style={{ width: 300, height: 100 }} className="specimen-overflow">
          Content wider and taller than its frame
        </div>
      </Frame>
    </>
  );
}
