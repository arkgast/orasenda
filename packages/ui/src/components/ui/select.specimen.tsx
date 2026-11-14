import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Select } from "./select";

const columns = [
  { value: "backlog", label: "Backlog" },
  { value: "today", label: "Today" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];

export function SelectSpecimen(): ReactElement {
  return (
    <>
      <Frame state="select-rest" width={320} height={120}>
        <Select label="Column" options={columns} defaultValue="today" />
      </Frame>
      <Frame state="select-helper" width={320} height={150}>
        <Select
          label="Priority"
          options={[
            { value: "none", label: "None" },
            { value: "high", label: "High" },
          ]}
          helper="High moves the card up its column."
        />
      </Frame>
      <Frame state="select-disabled" width={320} height={150}>
        <Select
          label="Column"
          options={columns}
          defaultValue="done"
          disabled
          helper="Done tasks stay put."
        />
      </Frame>
      <Frame state="select-page-picker" width={320} height={80}>
        <Select label="Routine" labelHidden options={columns} defaultValue="doing" />
      </Frame>
    </>
  );
}
