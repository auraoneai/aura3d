import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const previewRoot = resolve("tests/reports/v4-static-preview");
const reportPath = resolve("tests/reports/v4-static-preview-smoke.json");
const templates = [
  { id: "v4-product-viewer", marker: "__G3D_TEMPLATE_PRODUCT_VIEWER__", requiredText: "gallery-neutral-hdr" },
  { id: "v4-material-studio", marker: "__G3D_TEMPLATE_MATERIAL_STUDIO__", requiredText: "studio-softbox-hdr" },
  { id: "v4-asset-gallery", marker: "__G3D_TEMPLATE_ASSET_GALLERY__", requiredText: "BoomBox.glb" },
  { id: "v4-interactive-scene", marker: "__G3D_TEMPLATE_INTERACTIVE_SCENE__", requiredText: "warehouse-industrial-hdr" }
] as const;

const previews = templates.map((template) => {
  const previewDir = join(previewRoot, template.id);
  const files = existsSync(previewDir) ? listFiles(previewDir).map((file) => file.slice(previewDir.length + 1).replaceAll("\\", "/")) : [];
  const indexHtml = existsSync(join(previewDir, "index.html")) ? readFileSync(join(previewDir, "index.html"), "utf8") : "";
  const javascriptFiles = files.filter((file) => file.endsWith(".js"));
  const javascript = javascriptFiles.map((file) => readFileSync(join(previewDir, file), "utf8")).join("\n");
  const hashes = Object.fromEntries(files.map((file) => [
    file,
    createHash("sha256").update(readFileSync(join(previewDir, file))).digest("hex")
  ]));
  return {
    template: template.id,
    previewDir,
    files,
    hashes,
    ok: existsSync(previewDir) &&
      files.includes("index.html") &&
      javascriptFiles.length > 0 &&
      indexHtml.includes("<script") &&
      javascript.includes(template.marker) &&
      javascript.includes(template.requiredText) &&
      files.every((file) => statSync(join(previewDir, file)).size > 0)
  };
});

const report = {
  schema: "g3d-v4-static-preview-smoke/v1",
  generatedAt: new Date().toISOString(),
  ok: previews.every((preview) => preview.ok),
  previewRoot,
  previews,
  productBoundary: "Static file integrity smoke for every built V4 template. Full hosted browser deployment remains a release gate."
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function listFiles(dir: string, output: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    const stats = statSync(file);
    if (stats.isDirectory()) listFiles(file, output);
    else output.push(file);
  }
  return output;
}
