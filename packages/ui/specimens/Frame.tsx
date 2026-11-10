import type { ReactElement, ReactNode } from "react";

// Sizes come from the README's case list, so they are the one place a pixel value is allowed.
export function Frame(props: {
  state: string;
  width: number;
  height: number;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="specimen-case">
      <p className="specimen-label">{props.state}</p>
      <div
        className="specimen-frame"
        data-frame=""
        data-state={props.state}
        style={{ width: props.width, height: props.height }}
      >
        {props.children}
      </div>
    </div>
  );
}
