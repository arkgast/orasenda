import { singleKeyName } from "@domain/keyboard/bindings";
import { useBindings } from "@domain/keyboard/useBindings";
import { useSingleKeys } from "@domain/keyboard/useSingleKeys";
import { useState } from "react";

type Args = {
  /** `Settings.singleKey`. */
  enabled: boolean;
  canStart: boolean;
  active: boolean;
  start(): void;
  pauseResume(): void;
};

/**
 * Today's single keys: Space starts, pauses or resumes; P opens the preset
 * popover. P is a request the control counts and answers (`openRequest`).
 */
export function useTodayKeys({ enabled, canStart, active, start, pauseResume }: Args) {
  const [presetRequest, setPresetRequest] = useState(0);
  const toggle = () => {
    if (canStart) start();
    else if (active) pauseResume();
  };
  const openPreset = () => setPresetRequest((n) => n + 1);
  // The start or pause key comes from the registry; P is Today's own.
  const space = singleKeyName(useBindings().byId("startPause"));
  useSingleKeys({ ...(space ? { [space]: toggle } : {}), p: openPreset }, enabled);
  return { presetRequest };
}
