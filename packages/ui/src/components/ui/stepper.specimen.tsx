import { type ReactElement, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Stepper } from "./stepper";

function Live(props: { initial: number; max?: number; disabled?: boolean }): ReactElement {
  const [value, setValue] = useState(props.initial);
  return (
    <Stepper
      label="Estimate"
      value={value}
      min={0}
      max={props.max ?? 12}
      onChange={setValue}
      zeroLabel="No estimate"
      valueText={(n) => (n === 1 ? "1 session" : `${n} sessions`)}
      disabled={props.disabled}
    />
  );
}

export function StepperSpecimen(): ReactElement {
  return (
    <>
      <Frame state="stepper-zero" width={320} height={120}>
        <Live initial={0} />
      </Frame>
      <Frame state="stepper-value" width={320} height={120}>
        <Live initial={3} />
      </Frame>
      <Frame state="stepper-at-max" width={320} height={120}>
        <Live initial={12} />
      </Frame>
      <Frame state="stepper-disabled" width={320} height={120}>
        <Live initial={3} disabled />
      </Frame>
      <Frame state="stepper-narrow-271" width={271} height={120}>
        <Live initial={3} />
      </Frame>
      <Frame state="stepper-narrow-360" width={360} height={120}>
        <Live initial={3} />
      </Frame>
    </>
  );
}
