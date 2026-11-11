import { type TimerLayout, TimerRing, TimerStrip } from "@orasenda/ui";
import type { ReactElement } from "react";
import type { TimerView_Serialize } from "../../ipc/bindings";

type Props = {
  /** `null` before the first view, or when the timer is unavailable: the idle face. */
  view: TimerView_Serialize | null;
  layout: TimerLayout;
  /** The wall clock as text from Rust, for the ring. */
  clock?: string;
  /** The next session's length ("25 min"), shown by the strip while idle. */
  idleLength?: string;
};

/** The time: a fluid ring, or a strip (stacked in a narrow one). Switches on resize only. */
export function TimeView({ view, layout, clock, idleLength }: Props): ReactElement {
  const shown = {
    remaining: view?.remaining ?? "",
    remainingLabel: view?.remainingLabel ?? "",
    progress: view?.progress ?? 0,
    mode: view?.mode ?? "idle",
  } as const;
  if (layout === "ring") return <TimerRing size="fluid" clock={clock} {...shown} />;
  return <TimerStrip stacked={layout === "stackedStrip"} idleLength={idleLength} {...shown} />;
}
