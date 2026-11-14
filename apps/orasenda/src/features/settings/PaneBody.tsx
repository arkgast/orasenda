import type { Theme } from "@shared/ipc/bindings";
import type { Ref } from "react";
import { askMacOS, tick, untick } from "./notificationsToggle";
import type { PaneId } from "./panes";
import { About, type AboutInfo } from "./panes/About";
import { Backups } from "./panes/Backups";
import { General } from "./panes/General";
import { Notifications } from "./panes/Notifications";
import { Shortcuts } from "./panes/Shortcuts";
import { Timer } from "./panes/Timer";
import { YourData } from "./panes/YourData";
import { CADENCE_KEYS } from "./settingsKeys";
import type { SettingsModel } from "./useSettingsModel";

type Props = {
  pane: PaneId;
  headingRef: Ref<HTMLHeadingElement>;
  model: SettingsModel;
  info: AboutInfo;
};

/** The open pane, wired to the shared model. Only this pane is in the page. */
export function PaneBody({ pane, headingRef, model, info }: Props) {
  const m = model;
  switch (pane) {
    case "general":
      return (
        <General
          headingRef={headingRef}
          theme={m.shown.theme}
          disabled={m.readOnly}
          disabledReason={m.reason}
          status={m.reasonIf("theme")}
          onChange={(theme: Theme) => m.withLatest({ theme })}
        />
      );
    case "timer":
      return (
        <Timer
          headingRef={headingRef}
          settings={m.shown}
          presets={m.presets}
          presetsFailed={m.presetsFailed}
          running={m.running}
          disabled={m.readOnly}
          editLocked={m.readOnly || m.store === "unavailable"}
          disabledReason={m.reason}
          presetStatus={m.reasonIf("preset")}
          cadenceStatus={m.reasonIf(...CADENCE_KEYS)}
          editor={m.editor}
          onPreset={(presetId: string) => m.withLatest({ presetId })}
          onCadence={m.changeCadence}
        />
      );
    case "notifications":
      return (
        <Notifications
          headingRef={headingRef}
          checked={m.ticked.includes("notifySessionEnd") || m.shown.notifySessionEnd}
          asking={m.askingFor === "notifySessionEnd"}
          disabled={m.readOnly || m.status === "unavailable"}
          disabledReason={m.reason}
          line={m.notifyLine}
          action={m.row.action}
          onToggle={(checked) => {
            m.clearNotice();
            if (checked) tick(m.status);
            else untick();
          }}
          twoMinutes={m.ticked.includes("notifyTwoMinutes") || m.shown.notifyTwoMinutes}
          twoMinutesAsking={m.askingFor === "notifyTwoMinutes"}
          onTwoMinutes={(checked) => {
            m.clearNotice();
            if (checked) tick(m.status, "notifyTwoMinutes");
            else untick("notifyTwoMinutes");
          }}
          onAsk={askMacOS}
          onOpen={m.openSystemSettings}
        />
      );
    case "keyboard":
      return (
        <Shortcuts
          headingRef={headingRef}
          singleKey={m.shown.singleKey}
          disabled={m.readOnly}
          disabledReason={m.reason}
          status={m.reasonIf("singleKey")}
          onSingleKey={(singleKey) =>
            m.changeCadence({ singleKey }, `Single-key shortcuts: ${singleKey ? "on" : "off"}.`)
          }
          onSaved={m.say}
        />
      );
    case "about":
      return <About headingRef={headingRef} info={info} />;
    case "data":
      return <YourData headingRef={headingRef} />;
    case "backups":
      return <Backups headingRef={headingRef} />;
  }
}
