import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button";
import { FlowStep } from "./flow-step";

export function FlowStepSpecimen(): ReactElement {
  return (
    <>
      <Frame state="flow-step-optional-640x480" width={640} height={480}>
        <FlowStep
          title="Tomorrow"
          progress="Step 2 of 4 · Daily shutdown"
          primary={<Button variant="primary">Continue</Button>}
          notNow={{ label: "Not now", onClick: () => {} }}
          onEnd={() => {}}
        >
          <p className="m-0 text-body text-ink-muted">
            Two tasks are planned for tomorrow, about 90 minutes in all.
          </p>
        </FlowStep>
      </Frame>
      <Frame state="flow-step-last-640x480" width={640} height={480}>
        <FlowStep
          title="Shutdown complete"
          progress="Step 4 of 4 · Daily shutdown"
          primary={<Button variant="primary">Back to Review</Button>}
          onEnd={() => {}}
        >
          <p className="m-0 text-body text-ink-muted">That is all for today.</p>
        </FlowStep>
      </Frame>
    </>
  );
}
