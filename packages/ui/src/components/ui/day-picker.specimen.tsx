import { type ReactElement, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { DayPicker } from "./day-picker";

function Live(props: { initial: number; helper?: string; disabled?: boolean }): ReactElement {
  const [value, setValue] = useState(props.initial);
  return (
    <DayPicker
      label="Repeat on"
      value={value}
      onChange={setValue}
      helper={props.helper}
      disabled={props.disabled}
    />
  );
}

export function DayPickerSpecimen(): ReactElement {
  return (
    <>
      <Frame state="day-picker-weekdays" width={420} height={140}>
        <Live initial={0b0011111} helper="Weekdays" />
      </Frame>
      <Frame state="day-picker-every-day" width={420} height={140}>
        <Live initial={0b1111111} helper="Every day" />
      </Frame>
      <Frame state="day-picker-last-day" width={420} height={140}>
        <Live initial={0b0000100} />
      </Frame>
      <Frame state="day-picker-narrow-360" width={360} height={200}>
        <Live initial={0b1010101} />
      </Frame>
      <Frame state="day-picker-disabled" width={420} height={140}>
        <Live initial={0b0011111} helper="Weekdays" disabled />
      </Frame>
    </>
  );
}
