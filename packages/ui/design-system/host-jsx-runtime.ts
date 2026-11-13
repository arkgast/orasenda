// The bundle's JSX runtime: elements are made by the host page's global React (18 or later),
// not by an inlined React 19 jsx-runtime whose transitional elements a React 18 host cannot render.
// vite.config.ts aliases react/jsx-runtime and react/jsx-dev-runtime to this file for bundle.js only.
import { createElement, Fragment } from "react";

type Props = { children?: unknown; [key: string]: unknown };

export { Fragment };

/** jsx, jsxs and jsxDEV: key is lifted out of the props; children stay in props exactly as compiled. */
export function jsx(type: unknown, props: Props, key?: unknown): unknown {
  return createElement(type as never, key === undefined ? props : { ...props, key });
}

export const jsxs: typeof jsx = jsx;
export const jsxDEV: typeof jsx = jsx;
