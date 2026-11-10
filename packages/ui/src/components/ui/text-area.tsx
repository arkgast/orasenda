import type { ReactElement, TextareaHTMLAttributes } from "react";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helper?: string;
  error?: string;
}

export function TextArea(_props: TextAreaProps): ReactElement {
  return <div />;
}
