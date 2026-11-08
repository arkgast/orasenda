import * as React from "react";

// design/system/components/bundle.js is a classic script that reads window.React when it runs.
declare global {
  interface Window {
    React: typeof React;
  }
}

window.React = React;
