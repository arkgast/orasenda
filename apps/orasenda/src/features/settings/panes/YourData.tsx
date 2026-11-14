import type { Ref } from "react";

/** Placeholder until the Your data pane lands. */
export function YourData({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <section id="settings-data" aria-labelledby="settings-data-heading">
      <h2 ref={headingRef} id="settings-data-heading" tabIndex={-1} className="settings-heading">
        Your data
      </h2>
      <p className="app-muted">Coming in the next update.</p>
    </section>
  );
}
