import { osLabel } from "@domain/timer/format";
import { SettingsRow } from "@orasenda/ui";
import type { AppInfo } from "@shared/ipc/bindings";
import type { Ref } from "react";

export type AboutInfo =
  | { status: "loading" }
  | { status: "ok"; info: AppInfo }
  | { status: "error" };

export function aboutLine(info: AboutInfo): string | null {
  if (info.status === "ok") return `Orasenda ${info.info.version} for ${osLabel(info.info.os)}`;
  return info.status === "error" ? "Orasenda version unavailable" : null;
}

export function About({
  info,
  headingRef,
}: {
  info: AboutInfo;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const line = aboutLine(info);
  return (
    <section id="settings-about" aria-labelledby="settings-about-heading">
      <h2 ref={headingRef} id="settings-about-heading" tabIndex={-1} className="settings-heading">
        About
      </h2>
      <SettingsRow
        id="about"
        label="Orasenda"
        helper="Orasenda is free software under the Mozilla Public License 2.0."
      >
        <p className="settings-text">{line}</p>
        <p className="settings-text">
          Your data stays on this Mac. Orasenda doesn't use the network.
        </p>
      </SettingsRow>
    </section>
  );
}
