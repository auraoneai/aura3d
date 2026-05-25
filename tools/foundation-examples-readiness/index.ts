import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const examples = ["foundation-asset-viewer", "foundation-material-studio", "foundation-product-configurator", "foundation-interactive-scene", "foundation-game-slice"] as const;
const tutorialFiles = [
  "docs/project/tutorials-basic-app.md",
  "docs/project/tutorials-asset-viewer.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-material-studio.md",
  "docs/project/tutorials-interactive-scene.md"
] as const;
const requiredFiles = [
  "examples/index.html",
  "examples/foundation-example-shell.ts",
  ...examples.flatMap((example) => [`examples/${example}/index.html`, `examples/${example}/main.ts`, `examples/${example}/README.md`]),
  ...tutorialFiles,
  "tests/browser/foundation-examples.spec.ts"
] as const;
const manifestPath = resolve("tests/reports/foundation-examples/manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as BrowserExamplesManifest : undefined;
const fileChecks = requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)) }));
const exampleChecks = examples.map((example) => {
  const mainPath = resolve(`examples/${example}/main.ts`);
  const readmePath = resolve(`examples/${example}/README.md`);
  const main = existsSync(mainPath) ? readFileSync(mainPath, "utf8") : "";
  const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
  return {
    example,
    importsWorkflows: main.includes("@galileo3d/workflows"),
    usesPublicShell: main.includes("mountV3Example"),
    readmeMentionsGate: readme.includes("v3-examples.spec.ts"),
    avoidsV1Proof: !main.includes("-v1") && !readme.includes("-v1")
  };
});
const index = existsSync(resolve("examples/index.html")) ? readFileSync(resolve("examples/index.html"), "utf8") : "";
const indexPromotesOnlyV3 = examples.every((example) => index.includes(`./${example}/`))
  && !index.includes("./legacy-product-viewer/")
  && !index.includes("./legacy-material-studio/")
  && !index.includes("./legacy-asset-viewer/")
  && !index.includes("./legacy-rendering-showcase/");
const captureChecks = (manifest?.captures ?? []).map((capture) => ({
  ...capture,
  exists: existsSync(resolve(capture.path)),
  actualBytes: existsSync(resolve(capture.path)) ? statSync(resolve(capture.path)).size : 0
}));
const examplesWithCaptures = new Set(captureChecks.map((capture) => capture.id));

const report = {
  schema: "g3d-foundation-examples-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: fileChecks.every((file) => file.exists)
    && exampleChecks.every((example) => example.importsWorkflows && example.usesPublicShell && example.readmeMentionsGate && example.avoidsV1Proof)
    && indexPromotesOnlyV3
    && manifest?.pass === true
    && examples.every((example) => examplesWithCaptures.has(example))
    && captureChecks.every((capture) => capture.exists && capture.actualBytes > 10_000 && capture.drawCalls > 0 && capture.renderedItems > 0 && capture.lastError === null),
  fileChecks,
  exampleChecks,
  tutorialFiles: tutorialFiles.map((path) => ({ path, exists: existsSync(resolve(path)) })),
  indexPromotesOnlyV3,
  browserManifestPath: "tests/reports/foundation-examples/manifest.json",
  browserManifestExists: existsSync(manifestPath),
  captureChecks
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/foundation-examples-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

interface BrowserExamplesManifest {
  readonly pass: boolean;
  readonly captures: readonly {
    readonly id: string;
    readonly path: string;
    readonly bytes: number;
    readonly drawCalls: number;
    readonly frameCount: number;
    readonly renderedItems: number;
    readonly lastError: string | null;
  }[];
}
