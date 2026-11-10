import type { ReactElement } from "react";
import { IconButtonSpecimen } from "./IconButton.tsx";
import { KbdSpecimen } from "./Kbd.tsx";
import { Seed } from "./Seed.tsx";
import { TooltipSpecimen } from "./Tooltip.tsx";

export const specimens: Record<string, () => ReactElement> = {
  Seed,
  IconButton: IconButtonSpecimen,
  Tooltip: TooltipSpecimen,
  Kbd: KbdSpecimen,
};
