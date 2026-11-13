import { useState } from "react";
import { useSingleKeys } from "../../app/useSingleKeys";

type Args = {
  /** `Settings.singleKey`. */
  enabled: boolean;
  canStart: boolean;
  active: boolean;
  start(): void;
  pauseResume(): void;
};

/**
 * Today's single keys: Space starts, pauses or resumes; F opens the Focus view menu; P opens the
 * preset popover. F and P are requests the two controls count and answer (`openRequest`).
 */
export function useTodayKeys({ enabled, canStart, active, start, pauseResume }: Args) {
  const [viewRequest, setViewRequest] = useState(0);
  const [presetRequest, setPresetRequest] = useState(0);
  const toggle = () => {
    if (canStart) start();
    else if (active) pauseResume();
  };
  const openView = () => setViewRequest((n) => n + 1);
  const openPreset = () => setPresetRequest((n) => n + 1);
  useSingleKeys({ Space: toggle, f: openView, p: openPreset }, enabled);
  return { viewRequest, presetRequest };
}
