import type { Ref } from "react";

/** Placeholder until the Backups pane lands. */
export function Backups({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <section id="settings-backups" aria-labelledby="settings-backups-heading">
      <h2 ref={headingRef} id="settings-backups-heading" tabIndex={-1} className="settings-heading">
        Backups
      </h2>
      <p className="app-muted">Coming in the next update.</p>
    </section>
  );
}
