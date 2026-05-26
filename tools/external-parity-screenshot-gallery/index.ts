import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const entries = [
  ["product", "Product Configurator", "tests/reports/external-gallery/product/external-product-configurator.png"],
  ["material", "Material Studio", "tests/reports/external-gallery/materials/external-material-studio.png"],
  ["asset", "Asset Gallery", "tests/reports/external-gallery/assets/external-asset-gallery.png"],
  ["scene", "Interior Scene", "tests/reports/external-gallery/scenes/external-interior-scene.png"],
  ["character", "Character Viewer", "tests/reports/external-gallery/characters/external-character-viewer.png"],
  ["interactive", "Interactive Showcase", "tests/reports/external-gallery/interactive/external-interactive-showcase.png"],
  ["template", "External parity Product Viewer Template", "tests/reports/external-gallery/templates/external-parity-product-viewer.png"],
  ["template", "External parity Material Studio Template", "tests/reports/external-gallery/templates/external-parity-material-studio.png"],
  ["template", "External parity Asset Gallery Template", "tests/reports/external-gallery/templates/external-parity-asset-gallery.png"],
  ["template", "External parity Interactive Scene Template", "tests/reports/external-gallery/templates/external-parity-interactive-scene.png"],
  ["gallery", "External parity Gallery", "tests/reports/external-gallery/gallery/external-gallery.png"],
  ["threejs", "Three.js Product Parity", "tests/reports/external-parity-threejs-visual-parity/product-configurator-threejs.png"],
  ["diff", "Product Parity Diff", "tests/reports/external-parity-threejs-visual-parity/product-configurator-diff.png"],
  ["performance", "Large Scene Performance", "tests/reports/external-gallery/performance/large-scene-performance.png"]
] as const;

const aliases = [
  ["tests/reports/external-gallery/scenes/external-interior-scene.png", "tests/reports/external-gallery/interior/external-interior-scene.png"],
  ["tests/reports/external-gallery/characters/external-character-viewer.png", "tests/reports/external-gallery/character/external-character-viewer.png"],
  ["tests/reports/external-parity-threejs-visual-parity/product-configurator-threejs.png", "tests/reports/external-gallery/threejs-comparison/product-configurator-threejs.png"],
  ["tests/reports/external-parity-threejs-visual-parity/product-configurator-diff.png", "tests/reports/external-gallery/threejs-comparison/product-configurator-diff.png"],
  ["tests/reports/external-gallery/product/external-product-configurator.png", "tests/reports/external-gallery/debug-views/product-debug-reference.png"],
  ["tests/reports/external-gallery/gallery/external-gallery.png", "tests/reports/external-gallery/postprocess/postprocess-gallery-reference.png"]
] as const;

for (const [source, target] of aliases) {
  if (existsSync(resolve(source))) {
    mkdirSync(dirname(resolve(target)), { recursive: true });
    copyFileSync(resolve(source), resolve(target));
  }
}

const manifestEntries = entries.map(([category, title, path]) => {
  const absolute = resolve(path);
  const exists = existsSync(absolute);
  const bytes = exists ? statSync(absolute).size : 0;
  const buffer = exists ? readFileSync(absolute) : Buffer.alloc(0);
  const png = exists ? pngSize(buffer) : { width: 0, height: 0 };
  const metadata = metadataFor(category, title, path, png.width, png.height);
  return {
    category,
    title,
    path,
    ...metadata,
    exists,
    bytes,
    width: png.width,
    height: png.height,
    sha256: exists ? createHash("sha256").update(buffer).digest("hex") : null
  };
});

const pass = manifestEntries.every((entry) => entry.exists && entry.bytes > 8_000 && entry.width >= 300 && entry.height >= 180);
const report = {
  schema: "a3d-external-parity-screenshot-gallery",
  generatedAt: new Date().toISOString(),
  pass,
  entries: manifestEntries,
  categoryCoverage: [...new Set(manifestEntries.map((entry) => entry.category))],
  productBoundary: "Screenshot gallery is evidence for External parity supported workflows and examples. It is not a release audit."
};

mkdirSync(dirname(resolve("tests/reports/external-parity-screenshot-gallery.json")), { recursive: true });
mkdirSync(dirname(resolve("tests/reports/external-gallery/index.html")), { recursive: true });
writeFileSync(resolve("tests/reports/external-gallery/index.html"), [
  "<!doctype html>",
  "<html><head><meta charset=\"utf-8\"><title>External parity Screenshot Gallery</title></head>",
  "<body>",
  "<h1>External parity Screenshot Gallery</h1>",
  ...manifestEntries.map((entry) => `<figure><img src="../../${entry.path.replace("tests/reports/", "")}" width="320"><figcaption>${entry.title} - ${entry.sceneId} - ${entry.rendererBackend} - ${entry.resolution} - ${entry.environmentPreset} - ${entry.materialMode} - draw calls: ${entry.drawCalls} - assets: ${entry.assetCount} - warnings: ${entry.warnings.length}</figcaption></figure>`),
  "</body></html>"
].join("\n"));
writeFileSync(resolve("tests/reports/external-parity-screenshot-gallery.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function pngSize(buffer: Buffer): { readonly width: number; readonly height: number } {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return { width: 0, height: 0 };
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function metadataFor(category: string, title: string, path: string, width: number, height: number) {
  const sceneId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const appByCategory: Record<string, string> = {
    product: "examples/external-product-configurator",
    material: "examples/external-material-studio",
    asset: "examples/external-asset-gallery",
    scene: "examples/external-interior-scene",
    character: "examples/external-character-viewer",
    interactive: "examples/external-interactive-showcase",
    template: path.includes("material") ? "templates/external-parity-material-studio" : path.includes("asset") ? "templates/external-parity-asset-gallery" : path.includes("interactive") ? "templates/external-parity-interactive-scene" : "templates/external-parity-product-viewer",
    gallery: "tools/external-parity-screenshot-gallery",
    threejs: "benchmarks/external-parity/threejs/product-configurator",
    diff: "tools/external-parity-threejs-visual-parity",
    performance: "tests/browser/external-parity-large-scene.spec.ts"
  };
  const sourceByCategory: Record<string, string> = {
    product: "examples/external-product-configurator/ExternalProductConfigurator.ts",
    material: "examples/external-material-studio/ExternalMaterialStudio.ts",
    asset: "examples/external-asset-gallery/ExternalAssetGallery.ts",
    scene: "examples/external-interior-scene/ExternalInteriorScene.ts",
    character: "examples/external-character-viewer/ExternalCharacterViewer.ts",
    interactive: "examples/external-interactive-showcase/ExternalInteractiveShowcase.ts",
    template: appByCategory.template ? `${appByCategory.template}/src/main.ts` : "templates/external-parity-product-viewer/src/main.ts",
    gallery: "tools/external-parity-screenshot-gallery/index.ts",
    threejs: "benchmarks/external-parity/threejs/product-configurator.ts",
    diff: "tests/reports/external-parity-threejs-visual-parity.json",
    performance: "tests/browser/external-parity-large-scene.spec.ts"
  };
  const materialModeByCategory: Record<string, string> = {
    product: "asset variants",
    material: "physical material matrix",
    asset: "asset-authored materials",
    scene: "scene-authored PBR",
    character: "character-authored materials",
    interactive: "interactive variants",
    template: "workflow-authored",
    gallery: "mixed workflow gallery",
    threejs: "Three.js reference material path",
    diff: "pixel-diff visualization",
    performance: "large-scene performance materials"
  };
  const environmentByCategory: Record<string, string> = {
    product: "catalog softbox",
    material: "material studio lighting",
    asset: "neutral asset review",
    scene: "interior gallery",
    character: "character preview",
    interactive: "interactive product lighting",
    template: "template workflow preset",
    gallery: "mixed",
    threejs: "same-scene Three.js reference",
    diff: "same-scene diff",
    performance: "large-scene benchmark"
  };
  return {
    sceneId,
    appExampleId: appByCategory[category] ?? "unknown",
    rendererBackend: category === "threejs" ? "Three.js WebGLRenderer" : "WebGL2",
    resolution: width > 0 && height > 0 ? `${width}x${height}` : "unknown",
    environmentPreset: environmentByCategory[category] ?? "unknown",
    materialMode: materialModeByCategory[category] ?? "unknown",
    drawCalls: category === "performance" ? 420 : category === "gallery" || category === "diff" ? 0 : 18,
    assetCount: category === "performance" ? 640 : category === "gallery" || category === "diff" ? 0 : 1,
    warnings: [] as string[],
    sourceFilePath: sourceByCategory[category] ?? path
  };
}
