import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Catalog {
  readonly schema: string;
  readonly requirements: {
    readonly minimumExamples: number;
    readonly minimumBrowserTested: number;
    readonly minimumRealAssetExamples: number;
    readonly minimumHdrExamples: number;
  };
  readonly examples: readonly {
    readonly slug: string;
    readonly browserTested: boolean;
    readonly realAssets: readonly string[];
    readonly hdrEnvironment: string;
    readonly publicImport: string;
  }[];
}

interface RuntimeReport {
  readonly runtime?: {
    readonly status?: string;
    readonly rendererBackend?: string;
    readonly runtime?: {
      readonly drawCalls?: number;
      readonly triangleCount?: number;
      readonly hdrEnvironmentId?: string;
      readonly assetIds?: readonly string[];
    };
    readonly proofSummary?: { readonly pass?: boolean };
    readonly proof?: { readonly pixels?: { readonly nonBlackPixels?: number; readonly uniqueColorBuckets?: number } };
  };
}

const requiredSlugs = [
  "product-configurator",
  "damaged-helmet-hdr",
  "boom-box-textures",
  "material-extensions",
  "hdr-ibl-roughness",
  "architecture-day-night",
  "animated-character",
  "postprocess-cinematic",
  "large-instanced-scene",
  "webgpu-product",
  "threejs-migrated-scene"
];
const catalog = JSON.parse(readFileSync(resolve("examples/production-runtime-examples/catalog.json"), "utf8")) as Catalog;
const reports = catalog.examples.map((example) => {
  const sourcePath = resolve(`examples/production-runtime-examples/${example.slug}/main.ts`);
  const screenshotPath = resolve(`tests/reports/production-runtime-examples/${example.slug}.png`);
  const runtimePath = resolve(`tests/reports/production-runtime-examples/${example.slug}.json`);
  const source = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "";
  const report = existsSync(runtimePath) ? JSON.parse(readFileSync(runtimePath, "utf8")) as RuntimeReport : {};
  const runtime = report.runtime;
  return {
    slug: example.slug,
    filesPresent: existsSync(resolve(`examples/production-runtime-examples/${example.slug}/index.html`)) && existsSync(sourcePath),
    publicImport: source.includes(`from "${example.publicImport}"`) && !source.includes("/packages/") && !source.includes("getContext(\"2d\")"),
    screenshotPresent: existsSync(screenshotPath) && statSync(screenshotPath).size > 10_000,
    runtimeReady: runtime?.status === "ready",
    rendererProof: runtime?.rendererBackend === "webgl2" &&
      runtime.runtime?.drawCalls !== undefined &&
      runtime.runtime.drawCalls > 0 &&
      runtime.runtime.triangleCount !== undefined &&
      runtime.runtime.triangleCount > 0 &&
      runtime.proofSummary?.pass === true &&
      (runtime.proof?.pixels?.nonBlackPixels ?? 0) > 1000 &&
      (runtime.proof?.pixels?.uniqueColorBuckets ?? 0) > 4,
    realAssets: example.realAssets.length > 0 && example.realAssets.every((asset) => runtime?.runtime?.assetIds?.includes(asset)),
    hdr: runtime?.runtime?.hdrEnvironmentId === example.hdrEnvironment
  };
});
const checks = [
  { id: "schema", pass: catalog.schema === "g3d-production-runtime-example-catalog/v1", detail: catalog.schema },
  { id: "required-slugs", pass: requiredSlugs.every((slug) => catalog.examples.some((example) => example.slug === slug)), detail: catalog.examples.map((example) => example.slug).join(", ") },
  { id: "example-count", pass: catalog.examples.length >= catalog.requirements.minimumExamples, detail: `${catalog.examples.length}/${catalog.requirements.minimumExamples}` },
  { id: "browser-tested-count", pass: catalog.examples.filter((example) => example.browserTested).length >= catalog.requirements.minimumBrowserTested, detail: `${catalog.examples.filter((example) => example.browserTested).length}/${catalog.requirements.minimumBrowserTested}` },
  { id: "files-present", pass: reports.every((report) => report.filesPresent), detail: reports.filter((report) => !report.filesPresent).map((report) => report.slug).join(", ") },
  { id: "public-imports", pass: reports.every((report) => report.publicImport), detail: reports.filter((report) => !report.publicImport).map((report) => report.slug).join(", ") },
  { id: "browser-runtime-proof", pass: reports.every((report) => report.runtimeReady && report.rendererProof), detail: reports.filter((report) => !report.runtimeReady || !report.rendererProof).map((report) => report.slug).join(", ") },
  { id: "real-assets", pass: reports.filter((report) => report.realAssets).length >= catalog.requirements.minimumRealAssetExamples, detail: `${reports.filter((report) => report.realAssets).length}/${catalog.requirements.minimumRealAssetExamples}` },
  { id: "hdr-environments", pass: reports.filter((report) => report.hdr).length >= catalog.requirements.minimumHdrExamples, detail: `${reports.filter((report) => report.hdr).length}/${catalog.requirements.minimumHdrExamples}` },
  { id: "screenshots", pass: reports.every((report) => report.screenshotPresent), detail: reports.filter((report) => !report.screenshotPresent).map((report) => report.slug).join(", ") }
];
const report = {
  schema: "g3d-production-runtime-examples-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  examples: reports,
  checks
};
const reportPath = resolve("tests/reports/production-runtime-examples-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
