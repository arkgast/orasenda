// Every output of @orasenda/ui. The default export is the library build (ES, with one index.d.ts);
// the factories below build the artifact's classic scripts and styles, called by design-system/build.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { dts } from "rolldown-plugin-dts";
import { defineConfig, type InlineConfig, type Plugin, type UserConfig } from "vite";

const root = import.meta.dirname;
const src = resolve(root, "src");
const alias = { "@": src };
/** bundle.js makes its elements through the host's React (see design-system/host-jsx-runtime.ts). */
const hostJsx = {
  "react/jsx-runtime": resolve(root, "design-system/host-jsx-runtime.ts"),
  "react/jsx-dev-runtime": resolve(root, "design-system/host-jsx-runtime.ts"),
};

/** The runtime names index.ts exports, one `export { Name } from "…";` line each, in file order. */
export function runtimeExports(): string[] {
  const text = readFileSync(resolve(src, "index.ts"), "utf8");
  return [...text.matchAll(/^export \{ (\w+) \} from /gm)].map((m) => m[1] as string);
}

/** Line 1 of bundle.js: format 4, the namespace and the component (capitalised) exports. */
export function bundleHeader(names: readonly string[]): string {
  const components = names.filter((n) => /^[A-Z]/.test(n)).map((name) => ({ name }));
  return `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: "Orasenda", components })} */`;
}

/** A script is inlined or loaded by a page, so these two sequences must not appear in it. */
export function safeForHtml(code: string): string {
  return code.replaceAll("</script", "<\\/script").replaceAll("<!--", "<\\!--");
}

/** Writes a generated entry under .build/ (git-ignored) so it resolves react like any source file. */
function entryFile(name: string, code: string): string {
  const file = resolve(root, ".build", name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  return file;
}

/** Prepends text to the chunk of one output file. */
function banner(file: string, text: string): Plugin {
  return {
    name: "ds-header",
    generateBundle(_options, bundle) {
      const chunk = bundle[file];
      if (chunk?.type === "chunk") chunk.code = `${text}\n${chunk.code}`;
    },
  };
}

/** react-dom is CommonJS and requires react; in a classic script react is window.React. */
const reactIsGlobal: Plugin = {
  name: "react-is-global",
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === "chunk")
        file.code = file.code.replaceAll('require("react")', "window.React");
    }
  },
};

const safe: Plugin = {
  name: "safe-for-html",
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === "chunk") file.code = safeForHtml(file.code);
    }
  },
};

const productionReact = { "process.env.NODE_ENV": JSON.stringify("production") };

/** rolldown-plugin-dts, run before Vite's own TypeScript transform, which would strip the .d.ts it generates. */
function declarations(): Plugin[] {
  const plugins = [dts({ tsconfig: resolve(root, "tsconfig.json") })].flat() as unknown as Plugin[];
  return plugins.map((plugin) =>
    /fake/.test(plugin.name) ? { ...plugin, enforce: "pre" } : plugin,
  );
}

/** The library: ES modules, with react, react-dom and radix-ui left to the host. */
export function libraryConfig(
  entry: string = resolve(src, "index.ts"),
  outDir: string = resolve(root, "dist"),
): UserConfig {
  return defineConfig({
    resolve: { alias },
    plugins: declarations(),
    build: {
      lib: { entry, formats: ["es"], fileName: "index" },
      outDir,
      emptyOutDir: true,
      rolldownOptions: { external: [/^react(\/|$)/, /^react-dom(\/|$)/, /^radix-ui(\/|$)/] },
    },
  });
}
const config: UserConfig = libraryConfig();
export default config;

/** components/bundle.js and components/bundle.css: a classic script; react is window.React. */
export function bundleConfig(outDir: string): InlineConfig {
  const names = runtimeExports();
  const entry = `import "${resolve(root, "design-system/bundle.css")}";
import * as ui from "${resolve(src, "index.ts")}";
window.Orasenda = Object.assign(window.Orasenda || {}, { ${names.map((n) => `${n}: ui.${n}`).join(", ")} });
`;
  return {
    configFile: false,
    root,
    logLevel: "warn",
    resolve: { alias: { ...alias, ...hostJsx } },
    define: productionReact,
    plugins: [tailwindcss(), safe, banner("bundle.js", bundleHeader(names))],
    build: {
      outDir,
      emptyOutDir: false,
      minify: true,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      lib: {
        entry: entryFile("bundle-entry.ts", entry),
        formats: ["iife"],
        name: "OrasendaBundle",
        fileName: () => "bundle.js",
        cssFileName: "bundle",
      },
      rolldownOptions: {
        external: ["react", "react-dom"],
        output: { globals: { react: "React", "react-dom": "ReactDOM" } },
      },
    },
  };
}

/** components/lib/react.js and react-dom.js: React 19 as classic scripts. */
export function reactLibConfigs(outDir: string): InlineConfig[] {
  const make = (
    file: string,
    code: string,
    external: string[],
    globals: Record<string, string>,
    plugins: Plugin[] = [],
  ) =>
    ({
      configFile: false,
      root,
      logLevel: "warn",
      define: productionReact,
      plugins: [...plugins, safe],
      build: {
        outDir,
        emptyOutDir: false,
        minify: true,
        lib: {
          entry: entryFile(file, code),
          formats: ["iife"],
          name: "OrasendaLib",
          fileName: () => file,
        },
        rolldownOptions: { external, output: { globals } },
      },
    }) satisfies InlineConfig;
  return [
    make("react.js", `import React from "react";\nwindow.React = React;\n`, [], {}),
    make(
      "react-dom.js",
      `import ReactDOM from "react-dom";
import client from "react-dom/client";
window.ReactDOM = Object.assign({}, ReactDOM, client);
`,
      ["react"],
      { react: "React" },
      [reactIsGlobal],
    ),
  ];
}

/** One specimen page's script: renders the specimen in a light and a dark panel. */
export function specimenConfig(outDir: string, name: string, file: string): InlineConfig {
  const names = runtimeExports();
  const shim = `const O = window.Orasenda;\n${names.map((n) => `export const ${n} = O.${n};`).join("\n")}\n`;
  const entry = `import { createRoot } from "react-dom/client";
import { ${name}Specimen as Specimen } from "${file}";
for (const theme of ["light", "dark"]) {
  const host = document.getElementById(theme);
  if (host) createRoot(host).render(<Specimen />);
}
`;
  return {
    configFile: false,
    root,
    logLevel: "warn",
    define: productionReact,
    plugins: [
      {
        name: "ui-shim",
        enforce: "pre",
        async resolveId(source, importer, options) {
          if (!importer || !source.startsWith(".")) return undefined;
          const found = await this.resolve(source, importer, { ...options, skipSelf: true });
          return found?.id === resolve(src, "index.ts") ? "\0virtual:ui-shim" : undefined;
        },
        load: (id) => (id === "\0virtual:ui-shim" ? shim : undefined),
      },
      safe,
    ],
    build: {
      outDir,
      emptyOutDir: false,
      minify: true,
      lib: {
        entry: entryFile(`${name}.entry.tsx`, entry),
        formats: ["iife"],
        name: "OrasendaSpecimen",
        fileName: () => `${name}.specimen.js`,
      },
      rolldownOptions: {
        external: ["react", "react-dom/client"],
        output: { globals: { react: "React", "react-dom/client": "ReactDOM" } },
      },
    },
  };
}
