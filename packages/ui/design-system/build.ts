// Writes the Design System artifact's files (the layout of the Design System artifact type):
//   components/bundle.js, bundle.css, index.d.ts, lib/react.js, lib/react-dom.js,
//   components/<Name>/README.md and preview.html, README.md, tokens.json, design-system.json.
// Run: node design-system/build.ts [--out <dir>]   (default: <repo>/design/system, git-ignored)
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { build } from "vite";
import viteConfig, { bundleConfig, reactLibConfigs, specimenConfig } from "../vite.config.ts";

const here = import.meta.dirname;
const pkg = resolve(here, "..");
const repo = resolve(pkg, "..", "..");
const uiDir = join(pkg, "src", "components", "ui");

export const REACT_VERSION = "19.3.1";

export function arg(argv: readonly string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return value;
}

const pascal = (kebab: string) =>
  kebab.replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase());
const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The first prose paragraph of a README, after its title. */
export function firstParagraph(readme: string): string {
  for (const block of readme.split(/\n\s*\n/)) {
    const text = block.trim();
    if (text && !text.startsWith("#") && !text.startsWith("```") && !text.startsWith("|")) {
      return text.replace(/\s+/g, " ");
    }
  }
  return "";
}

/** The members of `interface <name>Props` or `type <name>Props`, as [name, type, required] rows. */
export function propsTable(dts: string, name: string): Array<[string, string, boolean]> {
  const start = dts.search(new RegExp(`(?:interface|type) ${name}Props\\b`));
  if (start < 0) return [];
  const open = dts.indexOf("{", start);
  if (open < 0) return [];
  let depth = 0;
  let i = open;
  const members: string[] = [];
  let from = open + 1;
  for (; i < dts.length; i++) {
    const c = dts[i];
    if (c === "{" || c === "(" || c === "[" || c === "<") depth++;
    else if (c === "}" || c === ")" || c === "]" || (c === ">" && dts[i - 1] !== "=")) {
      depth--;
      if (depth === 0) break;
    } else if (c === ";" && depth === 1) {
      members.push(dts.slice(from, i));
      from = i + 1;
    }
  }
  members.push(dts.slice(from, i));
  const rows: Array<[string, string, boolean]> = [];
  for (const raw of members) {
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const m = text.match(/^(\w+)(\?)?:\s*([\s\S]+)$/);
    if (m) rows.push([m[1] as string, (m[3] as string).replace(/\s+/g, " "), !m[2]]);
  }
  return rows;
}

/** One index.d.ts: the library build's own file, which already bundles types.ts. */
export function composeDeclarations(libDir: string): string {
  return readFileSync(join(libDir, "index.d.ts"), "utf8");
}

const CARD_STYLE = `body{margin:0;font-family:var(--font-sans);background:var(--surface);color:var(--ink)}
main{display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4)}
section{background:var(--surface);color:var(--ink);padding:var(--space-4)}
h1{margin:0;font-size:17px;line-height:24px}p{margin:0}table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:var(--space-1) var(--space-2);border-bottom:1px solid var(--line);vertical-align:top;font-size:13px;line-height:18px}
code{font-family:var(--font-mono)}`;

const page = (title: string, group: string, height: number, head: string, body: string) =>
  `<!-- @dsCard group="${group}" height=${height} -->
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="../bundle.css">
${head}</head>
<body>
${body}</body>
</html>
`;

const LIBS = `<script src="../lib/react.js"></script>
<script src="../lib/react-dom.js"></script>
<script src="../bundle.js"></script>
`;

function staticCard(name: string, readme: string, dts: string, card: Card): string {
  const rows = propsTable(dts, name);
  const table = rows.length
    ? `<table><thead><tr><th>Prop</th><th>Type</th><th>Required</th></tr></thead><tbody>${rows
        .map(
          ([n, t, req]) =>
            `<tr><td><code>${escapeHtml(n)}</code></td><td><code>${escapeHtml(t)}</code></td><td>${req ? "Yes" : "No"}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "<p>No props table in the contract.</p>";
  const panel = (theme: "light" | "dark") =>
    `<section data-theme="${theme}" aria-label="${theme === "light" ? "Light" : "Dark"} theme"><h1>${escapeHtml(name)}</h1><p>${escapeHtml(firstParagraph(readme))}</p>${table}</section>`;
  return page(
    name,
    card.group,
    card.height,
    `<style>${CARD_STYLE}</style>\n`,
    `<main>${panel("light")}${panel("dark")}</main>\n`,
  );
}

function specimenPage(name: string, script: string, card: Card): string {
  const panel = (theme: "light" | "dark") =>
    `<section id="${theme}" data-theme="${theme}" aria-label="${theme === "light" ? "Light" : "Dark"} theme" style="background:var(--surface);color:var(--ink)"></section>`;
  return page(
    name,
    card.group,
    card.height,
    "",
    `${panel("light")}\n${panel("dark")}\n${LIBS}<script>\n${script}</script>\n`,
  );
}

interface Card {
  group: string;
  height: number;
}

export async function generate(out: string): Promise<void> {
  const components = join(out, "components");
  // Never clear a folder this build did not make: `--out .` or `--out ..` must not wipe a package.
  if (
    existsSync(out) &&
    readdirSync(out).length > 0 &&
    !existsSync(join(out, "design-system.json"))
  ) {
    throw new Error(`${out} is not empty and holds no earlier build (no design-system.json)`);
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(components, "lib"), { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "ui-ds-"));
  try {
    // bundle.js + bundle.css, and the two React libraries.
    await build(bundleConfig(components));
    for (const config of reactLibConfigs(join(components, "lib"))) await build(config);

    // index.d.ts: the library build's single declaration file.
    const lib = join(work, "lib");
    await build({
      ...viteConfig,
      logLevel: "warn",
      configFile: false,
      build: { ...viteConfig.build, outDir: lib },
    });
    const dts = composeDeclarations(lib);
    writeFileSync(join(components, "index.d.ts"), dts);

    // Per-component README and preview.
    const cards = JSON.parse(
      readFileSync(join(pkg, "design-system", "cards.json"), "utf8"),
    ) as Record<string, Card>;
    const specimens = new Set(
      readdirSync(join(pkg, "specimens"))
        .filter((f) => /^[A-Z]\w+\.tsx$/.test(f) && !["Frame.tsx", "Seed.tsx"].includes(f))
        .map((f) => basename(f, ".tsx"))
        .filter((n) => n !== "icons"),
    );
    const readmes = readdirSync(uiDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => [pascal(basename(f, ".md")), join(uiDir, f)] as const);
    for (const [name, file] of readmes) {
      const readme = readFileSync(file, "utf8");
      const dir = join(components, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "README.md"), readme);
      const card = cards[name] ?? { group: "Components", height: 400 };
      if (specimens.has(name)) {
        const spec = join(work, name);
        await build(specimenConfig(spec, name, join(pkg, "specimens", `${name}.tsx`)));
        const script = readFileSync(join(spec, `${name}.specimen.js`), "utf8");
        writeFileSync(join(dir, "preview.html"), specimenPage(name, script, card));
      } else {
        writeFileSync(join(dir, "preview.html"), staticCard(name, readme, dts, card));
      }
    }
    // The cover, as written.
    mkdirSync(join(components, "Cover"), { recursive: true });
    copyFileSync(
      join(pkg, "design-system", "Cover", "preview.html"),
      join(components, "Cover", "preview.html"),
    );

    // Root files.
    copyFileSync(join(pkg, "design-system", "README.md"), join(out, "README.md"));
    copyFileSync(join(repo, "packages", "tokens", "tokens.json"), join(out, "tokens.json"));
    const json = JSON.parse(readFileSync(join(pkg, "design-system", "design-system.json"), "utf8"));
    json.libraries = [
      { name: "react", version: REACT_VERSION, global: "React", file: "components/lib/react.js" },
      {
        name: "react-dom",
        version: REACT_VERSION,
        global: "ReactDOM",
        file: "components/lib/react-dom.js",
      },
    ];
    json.editing = "code";
    json.lastChange = lastChange(json.lastChange);
    writeFileSync(join(out, "design-system.json"), `${JSON.stringify(json, null, 2)}\n`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function lastChange(previous: Record<string, string> | undefined): Record<string, string> {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  try {
    return {
      by: previous?.by ?? git("config", "user.name"),
      at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      via: "just design-system",
      note: `Built from ${git("rev-parse", "--short", "HEAD")}: ${git("log", "-1", "--format=%s")}`,
    };
  } catch {
    return {
      by: previous?.by ?? "",
      at: new Date().toISOString(),
      via: "just design-system",
      note: "Built",
    };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    await generate(resolve(arg(process.argv, "--out", join(repo, "design", "system"))));
  } catch (e) {
    console.error(`design-system build failed: ${(e as Error).message}`);
    process.exit(1);
  }
}
