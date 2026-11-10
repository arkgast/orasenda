import type { ReactElement, ReactNode } from "react";

// Frames the TimerRing specimen needs that Frame cannot draw: one that overflows on purpose (the
// harness must report it) and one that follows the viewport (the 390 x 844 and 1440 x 900 cases).
export function SeededOverflowFrame(): ReactElement {
  return (
    <div className="specimen-case">
      <p className="specimen-label">seeded-overflow</p>
      <div
        className="specimen-frame"
        data-frame=""
        data-state="seeded-overflow"
        style={{ width: 120, height: 40 }}
      >
        <div style={{ width: 300, height: 100 }} className="specimen-overflow">
          Content wider and taller than its frame
        </div>
      </div>
    </div>
  );
}

export function ViewportFrame(props: { state: string; children: ReactNode }): ReactElement {
  return (
    <div className="specimen-case" style={{ width: "100%" }}>
      <p className="specimen-label">{props.state}</p>
      <div
        className="specimen-frame"
        data-frame=""
        data-state={props.state}
        style={{ width: "100%", height: "70dvh" }}
      >
        {props.children}
      </div>
    </div>
  );
}
