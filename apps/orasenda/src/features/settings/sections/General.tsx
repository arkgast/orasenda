import { Choice, ChoiceGroup, SettingsRow } from "@orasenda/ui";
import type { Theme } from "@shared/ipc/bindings";
import { useId } from "react";

export const THEMES: ReadonlyArray<{ theme: Theme; label: string }> = [
  { theme: "system", label: "Match system" },
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
];

export function themeLabel(theme: Theme): string {
  return THEMES.find((entry) => entry.theme === theme)?.label ?? "Match system";
}

type Props = {
  theme: Theme;
  disabled: boolean;
  /** Shown when the whole page is read-only. */
  disabledReason?: string;
  /** The row's status line (a failed save). */
  status?: string;
  onChange: (theme: Theme) => void;
};

export function General({ theme, disabled, disabledReason, status, onChange }: Props) {
  const name = useId();
  return (
    <section id="settings-general" aria-labelledby="settings-general-heading">
      <h2 id="settings-general-heading" tabIndex={-1} className="settings-heading">
        General
      </h2>
      <SettingsRow
        id="theme"
        label="Theme"
        helper="Match system follows macOS. Light and Dark also set the title bar and the menu-bar menu."
        status={status}
        disabledReason={disabledReason}
      >
        <ChoiceGroup labelledBy="theme-label">
          {THEMES.map((entry) => (
            <Choice
              key={entry.theme}
              name={name}
              value={entry.theme}
              checked={theme === entry.theme}
              disabled={disabled}
              onChange={() => onChange(entry.theme)}
            >
              {entry.label}
            </Choice>
          ))}
        </ChoiceGroup>
      </SettingsRow>
    </section>
  );
}
