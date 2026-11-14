import type { NavPage } from "@orasenda/ui";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import { useEffect } from "react";
import { PaneBody } from "./PaneBody";
import { paneFor } from "./panes";
import type { AboutInfo } from "./panes/About";
import { SettingsShell } from "./SettingsShell";
import { type Arrival, focusFor, type SettingsTarget } from "./settingsTarget";
import { usePaneFocus } from "./usePaneFocus";
import { useSettingsModel } from "./useSettingsModel";

export type { Arrival, SettingsTarget };

export function Settings({
  info,
  arrival,
  onNavigate,
}: {
  info: AboutInfo;
  arrival: Arrival;
  onNavigate(page: NavPage): void;
}) {
  const { compact } = useWindowLayout();
  const model = useSettingsModel();
  const { root, heading, pane, go, retry } = usePaneFocus(
    arrival.target ? paneFor(arrival.target) : "general",
  );

  // Arrival: the h1 takes focus on each visit, or the target's field (or its pane's heading).
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new arrival is the trigger.
  useEffect(() => {
    const target = arrival.target;
    if (!target) root.current?.querySelector<HTMLElement>("h1")?.focus();
    else go(paneFor(target), focusFor(target));
  }, [arrival.seq]);

  // A target's field waits for the presets; try it again when they arrive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the presets arriving is the trigger.
  useEffect(retry, [model.presets.length > 0]);

  return (
    <SettingsShell
      rootRef={root}
      compact={compact}
      pane={pane}
      notice={model.notice}
      onSelect={(id, via) => go(id, via === "keyboard" ? "heading" : "none")}
      onNavigate={onNavigate}
    >
      <PaneBody pane={pane} headingRef={heading} model={model} info={info} />
    </SettingsShell>
  );
}
