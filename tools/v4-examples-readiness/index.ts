import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "examples/v4-gallery/index.html",
  "examples/product-configurator-v4/index.html",
  "examples/material-studio-v4/index.html",
  "examples/asset-gallery-v4/index.html",
  "examples/interior-scene-v4/index.html",
  "examples/character-viewer-v4/index.html",
  "examples/interactive-showcase-v4/index.html",
  "examples/hdr-ibl-v4/index.html",
  "examples/postprocess-v4/index.html",
  "docs/project/tutorials-v4-hdr-ibl.md",
  "docs/project/tutorials-v4-product-configurator.md",
  "docs/project/tutorials-v4-material-studio.md",
  "docs/project/tutorials-v4-asset-gallery.md",
  "docs/project/tutorials-v4-interior-scene.md",
  "docs/project/tutorials-v4-character-viewer.md",
  "docs/project/tutorials-v4-performance.md",
  "docs/project/v4-roadmap-tutorials-product-viewer.md",
  "docs/project/v4-roadmap-tutorials-material-studio.md",
  "docs/project/v4-roadmap-tutorials-asset-gallery.md",
  "docs/project/v4-roadmap-tutorials-interactive-scene.md",
  "tests/browser/v4-examples.spec.ts",
  "tools/v4-examples-readiness/index.ts",
  "tools/v4-screenshot-gallery/index.ts",
  "tools/v4-roadmap-visual-quality/index.ts",
  "tests/reports/v4-examples-browser.json",
  "tests/reports/v4-screenshot-gallery.json",
  "tests/reports/v4-visual-quality.json"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const text = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): Obj | undefined => existsSync(resolve(path)) ? JSON.parse(text(path)) as Obj : undefined;
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

for (const file of requiredFiles) check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);

const browser = json("tests/reports/v4-examples-browser.json");
check("browser-gallery", browser?.ok === true && arr(browser.cards).length === 8, "Browser gallery test must load eight gallery cards with images and links.");

const gallery = json("tests/reports/v4-screenshot-gallery.json");
check("screenshot-gallery", gallery?.pass === true && arr(gallery.entries).length >= 10, "Screenshot gallery manifest must pass with broad category coverage.");

const visual = json("tests/reports/v4-visual-quality.json");
check("visual-quality", visual?.pass === true && arr(visual.scores).length >= 10, "Visual QA report must pass for gallery screenshots.");

const tutorialText = [
  "docs/project/tutorials-v4-hdr-ibl.md",
  "docs/project/tutorials-v4-product-configurator.md",
  "docs/project/tutorials-v4-material-studio.md",
  "docs/project/tutorials-v4-asset-gallery.md",
  "docs/project/tutorials-v4-interior-scene.md",
  "docs/project/tutorials-v4-character-viewer.md",
  "docs/project/tutorials-v4-performance.md",
  "docs/project/v4-roadmap-tutorials-product-viewer.md",
  "docs/project/v4-roadmap-tutorials-material-studio.md",
  "docs/project/v4-roadmap-tutorials-asset-gallery.md",
  "docs/project/v4-roadmap-tutorials-interactive-scene.md"
].map((path) => text(path)).join("\n");
check(
  "tutorial-public-api",
  ["@galileo3d/engine", "createG3DApp", "workflows", "Evidence:", "Boundary:", "HDR/IBL", "Performance"].every((marker) => tutorialText.includes(marker)),
  "Tutorials must use public SDK imports and explicitly cite evidence plus claim boundaries."
);
check(
  "required-v4-example-set",
  ["examples/hdr-ibl-v4/main.ts", "examples/postprocess-v4/main.ts"].every((file) => existsSync(resolve(file)) && text(file).includes("@galileo3d/engine")),
  "HDR/IBL and postprocess examples must exist and import the public package."
);
check(
  "package-script",
  text("package.json").includes("\"v4:examples\""),
  "package.json must expose v4:examples."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-v4-examples-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 16 examples, tutorials, gallery, and visual QA are ready."
    : "V4 Milestone 16 examples, tutorials, gallery, and visual QA are incomplete.",
  checkedFiles: requiredFiles,
  checks
};

mkdirSync(dirname(resolve("tests/reports/v4-examples-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-examples-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
