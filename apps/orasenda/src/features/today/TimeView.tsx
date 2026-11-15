import { type TimerLayout, TimerRing, TimerStrip } from "@orasenda/ui";
import type { TimerView_Serialize } from "@shared/ipc/bindings";
import type { ReactElement, ReactNode } from "react";

type Props = {
  /** `null` before the first view, or when the timer is unavailable: the idle face. */
  view: TimerView_Serialize | null;
  layout: TimerLayout;
  /** The wall clock as text from Rust, for the ring. */
  clock?: string;
  /** The next session's length ("25 min"), shown by the strip while idle. */
  idleLength?: string;
  /** The linked task's title, shown under the time. */
  task?: string;
  /** The optional task control, above the time. */
  slot?: ReactNode;
};

/** The time: a fluid ring, or a strip (stacked in a narrow one). Switches on resize only. */
export function TimeView({ view, layout, clock, idleLength, task, slot }: Props): ReactElement {
  const shown = {
    remaining: view?.remaining ?? "",
    remainingLabel: view?.remainingLabel ?? "",
    progress: view?.progress ?? 0,
    mode: view?.mode ?? "idle",
  } as const;
  // The stacked strip has no room for the task line (TimerStrip README): it is whole in the name only.
  const time =
    layout === "ring" ? (
      <TimerRing size="fluid" clock={clock} task={task} {...shown} />
    ) : (
      <TimerStrip
        stacked={layout === "stackedStrip"}
        idleLength={idleLength}
        task={layout === "stackedStrip" ? undefined : task}
        {...shown}
      />
    );
  if (!slot) return time;
  return (
    <>
      {slot}
      {time}
    </>
  );
}
