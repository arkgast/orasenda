import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Choice, ChoiceGroup } from "./choice";

export function ChoiceSpecimen(): ReactElement {
  return (
    <>
      <Frame state="choice-radio" width={480} height={140}>
        <ChoiceGroup legend="Preset">
          <Choice name="spec-preset" value="classic" defaultChecked>
            Classic 25/5
          </Choice>
          <Choice name="spec-preset" value="fifty">
            50/10
          </Choice>
          <Choice name="spec-preset" value="deep" disabled>
            Deep Block 90
          </Choice>
        </ChoiceGroup>
      </Frame>
      <Frame state="choice-checkbox" width={480} height={140}>
        <ChoiceGroup legend="Apps to intercept">
          <Choice type="checkbox" defaultChecked>
            Safari
          </Choice>
          <Choice type="checkbox">Notes</Choice>
          <Choice type="checkbox" disabled>
            Unnamed app
          </Choice>
        </ChoiceGroup>
      </Frame>
      <Frame state="choice-segmented" width={480} height={140}>
        <ChoiceGroup legend="List" variant="segmented">
          <Choice name="spec-list" value="today" defaultChecked>
            Today
          </Choice>
          <Choice name="spec-list" value="week">
            This week
          </Choice>
          <Choice name="spec-list" value="later">
            Later
          </Choice>
        </ChoiceGroup>
      </Frame>
      <Frame state="choice-long" width={480} height={220}>
        <ChoiceGroup legend="Strength">
          <Choice
            long
            name="spec-strength"
            value="light"
            defaultChecked
            description="A gentle nudge when you drift."
          >
            Light
          </Choice>
          <Choice
            long
            name="spec-strength"
            value="firm"
            description="The app is hidden until you decide."
          >
            Firm
          </Choice>
        </ChoiceGroup>
      </Frame>
    </>
  );
}
