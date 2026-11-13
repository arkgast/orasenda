import { osLabel } from "@domain/timer/format";
import { SettingsRow } from "@orasenda/ui";
import type { AppInfo } from "@shared/ipc/bindings";

export type AboutInfo =
  | { status: "loading" }
  | { status: "ok"; info: AppInfo }
  | { status: "error" };

export function aboutLine(info: AboutInfo): string | null {
  if (info.status === "ok") return `Orasenda ${info.info.version} for ${osLabel(info.info.os)}`;
  return info.status === "error" ? "Orasenda version unavailable" : null;
}

export function About({ info }: { info: AboutInfo }) {
  const line = aboutLine(info);
  return (
    <section id="settings-about" aria-labelledby="settings-about-heading">
      <h2 id="settings-about-heading" tabIndex={-1} className="settings-heading">
        About and data
      </h2>
      <SettingsRow
        id="about"
        label="Orasenda"
        helper="Orasenda is free software under the Mozilla Public License 2.0."
      >
        <p className="settings-text">{line}</p>
        <p className="settings-text">
          Your sessions and settings stay on this Mac. Orasenda doesn't use the network.
        </p>
      </SettingsRow>
    </section>
  );
}
