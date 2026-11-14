import { type ReactElement, useState } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { TagField } from "./tag-field";

function Live(props: { initial: string[]; max?: number }): ReactElement {
  const [tags, setTags] = useState(props.initial);
  return <TagField label="Tags" tags={tags} onChange={setTags} max={props.max} />;
}

export function TagFieldSpecimen(): ReactElement {
  return (
    <>
      <Frame state="tag-field-empty" width={360} height={120}>
        <Live initial={[]} />
      </Frame>
      <Frame state="tag-field-tags" width={360} height={160}>
        <Live initial={["Writing", "Deep", "Client work"]} />
      </Frame>
      <Frame state="tag-field-wrapping" width={360} height={220}>
        <Live
          initial={["Writing", "Deep", "Client work", "Planning", "Reading", "Admin", "Errands"]}
        />
      </Frame>
      <Frame state="tag-field-at-max" width={360} height={160}>
        <Live initial={["One", "Two"]} max={2} />
      </Frame>
    </>
  );
}
