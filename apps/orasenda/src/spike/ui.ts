import { type ButtonProps, Button as DesignButton } from "@orasenda/ui";
import type { ButtonHTMLAttributes, ReactElement } from "react";

/**
 * The design system's `Button`. design/system/components/index.d.ts imports `react` from a
 * folder where it does not resolve, so `ButtonProps` loses the native button attributes
 * (`onClick`, …); this restores them.
 */
export const Button = DesignButton as (
  props: ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => ReactElement;
