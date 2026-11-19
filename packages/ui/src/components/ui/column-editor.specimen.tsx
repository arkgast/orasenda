import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { ColumnEditor, type ColumnEditorProps } from "./column-editor.tsx";

const noop = () => {};
const base: ColumnEditorProps = {
  name: "Review",
  limit: null,
  taken: ["Backlog", "Today", "Doing", "Done"],
  canAdd: true,
  canRemove: true,
  onSave: noop,
  onCancel: noop,
  onAdd: noop,
  onRemove: noop,
};

function Case(props: { state: string; over: Partial<ColumnEditorProps>; height?: number }) {
  return (
    <Frame state={props.state} width={280} height={props.height ?? 400}>
      <ColumnEditor {...base} {...props.over} />
    </Frame>
  );
}

export function ColumnEditorSpecimen(): ReactElement {
  return (
    <>
      <Case
        state="column-editor-custom"
        over={{ limit: { value: 0, min: 0, max: 9, zeroLabel: "No limit" } }}
        height={460}
      />
      <Case
        state="column-editor-dimmed"
        over={{
          limit: { value: 3, min: 0, max: 9, zeroLabel: "No limit" },
          canAdd: { reason: "Up to 4 extra columns." },
          canRemove: { reason: "Move its tasks out first." },
        }}
        height={520}
      />
      <Case
        state="column-editor-built-in"
        over={{ name: "Today", limit: { value: 5, min: 1, max: 9 }, canRemove: null }}
        height={420}
      />
      <Case
        state="column-editor-name-taken"
        over={{ name: "today", canRemove: null }}
        height={340}
      />
      <Case
        state="column-editor-service-error"
        over={{ error: "That column is gone. Pick another.", canRemove: null }}
        height={340}
      />
    </>
  );
}
