import { EmptyState, SettingsRow } from "@orasenda/ui";

export function AppsAndSites() {
  return (
    <section id="settings-appsAndSites" aria-labelledby="settings-appsAndSites-heading">
      <h2 id="settings-appsAndSites-heading" tabIndex={-1} className="settings-heading">
        Apps and sites
      </h2>
      <SettingsRow id="apps" label="Apps and sites" helper="">
        <EmptyState
          variant="inline"
          message="Nothing is recorded yet. Choosing which apps count as focus or distraction comes in a later update."
        />
      </SettingsRow>
    </section>
  );
}
