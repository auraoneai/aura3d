import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "examples/external-gallery/index.html",
  "examples/external-product-configurator/index.html",
  "examples/external-material-studio/index.html",
  "examples/external-asset-gallery/index.html",
  "examples/external-interior-scene/index.html",
  "examples/external-character-viewer/index.html",
  "examples/external-interactive-showcase/index.html",
  "examples/external-hdr-ibl/index.html",
  "examples/external-postprocess/index.html",
  "docs/project/tutorials-getting-started-real-scene.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-external-parity-material-studio.md",
  "docs/project/tutorials-external-parity-asset-gallery.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-getting-started-real-scene.md",
  "docs/project/verification-evidence.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/getting-started.md",
  "docs/project/tutorials-getting-started-real-scene.md",
  "tests/browser/external-parity-examples.spec.ts",
  "tools/external-parity-examples-readiness/index.ts",
  "tools/external-parity-screenshot-gallery/index.ts",
  "tools/external-parity-roadmap-visual-quality/index.ts",
  "tests/reports/external-parity-examples-browser.json",
  "tests/reports/external-parity-screenshot-gallery.json",
  "tests/reports/external-parity-visual-quality.json"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const text = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): Obj | undefined => existsSync(resolve(path)) ? JSON.parse(text(path)) as Obj : undefined;
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

for (const file of requiredFiles) check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);

const browser = json("tests/reports/external-parity-examples-browser.json");
check("browser-gallery", browser?.ok === true && arr(browser.cards).length === 8, "Browser gallery test must load eight gallery cards with images and links.");

const gallery = json("tests/reports/external-parity-screenshot-gallery.json");
check("screenshot-gallery", gallery?.pass === true && arr(gallery.entries).length >= 10, "Screenshot gallery manifest must pass with broad category coverage.");

const visual = json("tests/reports/external-parity-visual-quality.json");
check("visual-quality", visual?.pass === true && arr(visual.scores).length >= 10, "Visual QA report must pass for gallery screenshots.");

const tutorialText = [
  "docs/project/tutorials-getting-started-real-scene.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-external-parity-material-studio.md",
  "docs/project/tutorials-external-parity-asset-gallery.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-getting-started-real-scene.md",
  "docs/project/verification-evidence.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/getting-started.md",
  "docs/project/tutorials-getting-started-real-scene.md"
].map((path) => text(path)).join("\n");
check(
  "tutorial-public-api",
  ["@aura3d/engine", "createA3DApp", "workflows", "Evidence:", "Boundary:", "HDR/IBL", "Performance"].every((marker) => tutorialText.includes(marker)),
  "Tutorials must use public SDK imports and explicitly cite evidence plus claim boundaries."
);
check(
  "required-external-parity-example-set",
  ["examples/external-hdr-ibl/main.ts", "examples/external-postprocess/main.ts"].every((file) => existsSync(resolve(file)) && text(file).includes("@aura3d/engine")),
  "HDR/IBL and postprocess examples must exist and import the public package."
);
check(
  "package-script",
  text("package.json").includes("\"external-parity:examples\""),
  "package.json must expose external-parity:examples."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-examples-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "External parity Milestone 16 examples, tutorials, gallery, and visual QA are ready."
    : "External parity Milestone 16 examples, tutorials, gallery, and visual QA are incomplete.",
  checkedFiles: requiredFiles,
  checks
};

mkdirSync(dirname(resolve("tests/reports/external-parity-examples-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-examples-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
