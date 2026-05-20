import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface V5ExampleCatalog {
  readonly schema: "g3d-v5-example-catalog/v1";
  readonly requirements: {
    readonly minimumExamples: number;
    readonly minimumBrowserTested: number;
    readonly minimumThreeReferenceMappings: number;
  };
  readonly examples: readonly {
    readonly slug: string;
    readonly category: string;
    readonly title: string;
    readonly threeReference: string | null;
    readonly browserTested: boolean;
    readonly publicImports: string;
    readonly thumbnail: string;
  }[];
}

const requiredDirs = [
  "basic-scene",
  "materials-physical",
  "gltf-loader",
  "obj-loader",
  "hdr-environment",
  "postprocess-bloom",
  "postprocess-dof",
  "controls-orbit",
  "controls-transform",
  "animation-skinning",
  "morph-targets",
  "particles",
  "sprites",
  "lines",
  "instancing",
  "raycasting",
  "shader-material",
  "render-targets",
  "large-scene",
  "product-configurator",
  "architecture-interior",
  "automotive-configurator",
  "threejs-migrated-custom-scene"
];
const catalog = JSON.parse(readFileSync(resolve("examples/v5/catalog.json"), "utf8")) as V5ExampleCatalog;
const missing = catalog.examples.flatMap((example) => [
  `examples/v5/${example.slug}/index.html`,
  `examples/v5/${example.slug}/main.ts`,
  `examples/v5/${example.thumbnail}`
].filter((file) => !existsSync(resolve(file))));
const missingRequiredDirs = requiredDirs.filter((dir) => !existsSync(resolve(`examples/v5/${dir}/index.html`)));
const relativeImports = catalog.examples.flatMap((example) => {
  const source = readFileSync(resolve(`examples/v5/${example.slug}/main.ts`), "utf8");
  return /from\s+["']\.\.|\bimport\s+["']\.\./.test(source) ? [example.slug] : [];
});
const galleryHtml = readFileSync(resolve("examples/v5/index.html"), "utf8");
const checks = [
  { name: "schema", pass: catalog.schema === "g3d-v5-example-catalog/v1", detail: catalog.schema },
  { name: "required-directories", pass: missingRequiredDirs.length === 0, detail: missingRequiredDirs.join(", ") || "all required examples/v5 directories exist" },
  { name: "example-count", pass: catalog.examples.length >= catalog.requirements.minimumExamples, detail: `${catalog.examples.length}/${catalog.requirements.minimumExamples} examples` },
  { name: "browser-tested-count", pass: catalog.examples.filter((example) => example.browserTested).length >= catalog.requirements.minimumBrowserTested, detail: `${catalog.examples.filter((example) => example.browserTested).length}/${catalog.requirements.minimumBrowserTested} browser-tested examples` },
  { name: "three-reference-mappings", pass: catalog.examples.filter((example) => example.threeReference).length >= catalog.requirements.minimumThreeReferenceMappings, detail: `${catalog.examples.filter((example) => example.threeReference).length}/${catalog.requirements.minimumThreeReferenceMappings} mappings` },
  { name: "files-present", pass: missing.length === 0, detail: missing.join(", ") || "all V5 example files and thumbnails exist" },
  { name: "gallery", pass: existsSync(resolve("examples/v5/index.html")) && /screenshot thumbnail/.test(galleryHtml) && /data-category=/.test(galleryHtml), detail: "gallery page lists categories and thumbnail images" },
  { name: "public-imports-only", pass: relativeImports.length === 0, detail: relativeImports.join(", ") || "examples use public package imports only" }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "g3d-v5-examples-readiness/v1", generatedAt: new Date().toISOString(), pass, examples: catalog.examples, checks };
const reportPath = resolve("tests/reports/v5-examples-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 examples readiness passed: ${catalog.examples.length} examples.`);
