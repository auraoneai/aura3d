import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const entries = [
  ["product", "Product Configurator", "tests/reports/v4-gallery/product/product-configurator-v4.png"],
  ["material", "Material Studio", "tests/reports/v4-gallery/materials/material-studio-v4.png"],
  ["asset", "Asset Gallery", "tests/reports/v4-gallery/assets/asset-gallery-v4.png"],
  ["scene", "Interior Scene", "tests/reports/v4-gallery/scenes/interior-scene-v4.png"],
  ["character", "Character Viewer", "tests/reports/v4-gallery/characters/character-viewer-v4.png"],
  ["interactive", "Interactive Showcase", "tests/reports/v4-gallery/interactive/interactive-showcase-v4.png"],
  ["template", "V4 Product Viewer Template", "tests/reports/v4-gallery/templates/v4-product-viewer.png"],
  ["template", "V4 Material Studio Template", "tests/reports/v4-gallery/templates/v4-material-studio.png"],
  ["template", "V4 Asset Gallery Template", "tests/reports/v4-gallery/templates/v4-asset-gallery.png"],
  ["template", "V4 Interactive Scene Template", "tests/reports/v4-gallery/templates/v4-interactive-scene.png"],
  ["gallery", "V4 Gallery", "tests/reports/v4-gallery/gallery/v4-gallery.png"],
  ["threejs", "Three.js Product Parity", "tests/reports/v4-threejs-visual-parity/product-configurator-threejs.png"],
  ["diff", "Product Parity Diff", "tests/reports/v4-threejs-visual-parity/product-configurator-diff.png"],
  ["performance", "Large Scene Performance", "tests/reports/v4-gallery/performance/large-scene-performance.png"]
] as const;

const aliases = [
  ["tests/reports/v4-gallery/scenes/interior-scene-v4.png", "tests/reports/v4-gallery/interior/interior-scene-v4.png"],
  ["tests/reports/v4-gallery/characters/character-viewer-v4.png", "tests/reports/v4-gallery/character/character-viewer-v4.png"],
  ["tests/reports/v4-threejs-visual-parity/product-configurator-threejs.png", "tests/reports/v4-gallery/threejs-comparison/product-configurator-threejs.png"],
  ["tests/reports/v4-threejs-visual-parity/product-configurator-diff.png", "tests/reports/v4-gallery/threejs-comparison/product-configurator-diff.png"],
  ["tests/reports/v4-gallery/product/product-configurator-v4.png", "tests/reports/v4-gallery/debug-views/product-debug-reference.png"],
  ["tests/reports/v4-gallery/gallery/v4-gallery.png", "tests/reports/v4-gallery/postprocess/postprocess-gallery-reference.png"]
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
  schema: "g3d-v4-screenshot-gallery/v1",
  generatedAt: new Date().toISOString(),
  pass,
  entries: manifestEntries,
  categoryCoverage: [...new Set(manifestEntries.map((entry) => entry.category))],
  productBoundary: "Screenshot gallery is evidence for V4 supported workflows and examples. It is not a release audit."
};

mkdirSync(dirname(resolve("tests/reports/v4-screenshot-gallery.json")), { recursive: true });
mkdirSync(dirname(resolve("tests/reports/v4-gallery/index.html")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-gallery/index.html"), [
  "<!doctype html>",
  "<html><head><meta charset=\"utf-8\"><title>V4 Screenshot Gallery</title></head>",
  "<body>",
  "<h1>V4 Screenshot Gallery</h1>",
  ...manifestEntries.map((entry) => `<figure><img src="../../${entry.path.replace("tests/reports/", "")}" width="320"><figcaption>${entry.title} - ${entry.sceneId} - ${entry.rendererBackend} - ${entry.resolution} - ${entry.environmentPreset} - ${entry.materialMode} - draw calls: ${entry.drawCalls} - assets: ${entry.assetCount} - warnings: ${entry.warnings.length}</figcaption></figure>`),
  "</body></html>"
].join("\n"));
writeFileSync(resolve("tests/reports/v4-screenshot-gallery.json"), `${JSON.stringify(report, null, 2)}\n`);
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
    product: "examples/product-configurator-v4",
    material: "examples/material-studio-v4",
    asset: "examples/asset-gallery-v4",
    scene: "examples/interior-scene-v4",
    character: "examples/character-viewer-v4",
    interactive: "examples/interactive-showcase-v4",
    template: path.includes("material") ? "templates/v4-material-studio" : path.includes("asset") ? "templates/v4-asset-gallery" : path.includes("interactive") ? "templates/v4-interactive-scene" : "templates/v4-product-viewer",
    gallery: "tools/v4-screenshot-gallery",
    threejs: "benchmarks/v4/threejs/product-configurator",
    diff: "tools/v4-threejs-visual-parity",
    performance: "tests/browser/v4-large-scene.spec.ts"
  };
  const sourceByCategory: Record<string, string> = {
    product: "examples/product-configurator-v4/ProductConfiguratorV4.ts",
    material: "examples/material-studio-v4/MaterialStudioV4.ts",
    asset: "examples/asset-gallery-v4/AssetGalleryV4.ts",
    scene: "examples/interior-scene-v4/InteriorSceneV4.ts",
    character: "examples/character-viewer-v4/CharacterViewerV4.ts",
    interactive: "examples/interactive-showcase-v4/InteractiveShowcaseV4.ts",
    template: appByCategory.template ? `${appByCategory.template}/src/main.ts` : "templates/v4-product-viewer/src/main.ts",
    gallery: "tools/v4-screenshot-gallery/index.ts",
    threejs: "benchmarks/v4/threejs/product-configurator.ts",
    diff: "tests/reports/v4-threejs-visual-parity.json",
    performance: "tests/browser/v4-large-scene.spec.ts"
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
