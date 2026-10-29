#!/usr/bin/env node
// Stores the main cast's normal maps as JPEG instead of PNG, the largest single saving in a story's download.
// Five characters came out of the optimiser with a 1024 px PNG normal map of 1.1-1.7 MB, about half of each GLB,
// while Gogo's normal map was already a JPEG. Quality 95 with no chroma subsampling (4:4:4, so the x and y channels
// keep full resolution) cuts each map to 0.3-0.5 MB at a mean normal error of about 1 degree.
//
// Only the normal map's encoding changes. Geometry, materials, the base colour and metallic-roughness maps, the
// sampler and the asset extras are untouched: every accessor is hashed before and after, and a mismatch stops the run.
//
//   node apps/veer-wonder-world/tools/jpeg-normal-maps.mjs [--only key1,key2]
//
// Rewrites each changed GLB as src/assets/models/<key>.<sha8>.glb (removing the old file), records the change in
// provenance/models/<key>.json (processing.normalMapJpeg) and points provenance/portraits.json at the new file, then
// regenerates src/aura-assets.ts and src/assets/rights-manifest.ts. admit-models.mjs applies the same step on
// admission (jpegNormalMaps below), so a re-admitted character comes out the same way.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const NORMAL_MAP_JPEG = { quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true };

/** Re-encodes every PNG texture that is used only as a normal map. Returns one entry per re-encoded texture. */
export async function jpegNormalMaps(doc, sharp) {
  const root = doc.getRoot();
  const report = [];
  for (const texture of root.listTextures()) {
    if (texture.getMimeType() !== "image/png") continue;
    const materials = root.listMaterials();
    const asNormal = materials.some((material) => material.getNormalTexture() === texture);
    const asOther = materials.some(
      (material) =>
        material.getBaseColorTexture() === texture ||
        material.getMetallicRoughnessTexture() === texture ||
        material.getOcclusionTexture() === texture ||
        material.getEmissiveTexture() === texture
    );
    if (!asNormal || asOther) continue;
    const png = Buffer.from(texture.getImage());
    const jpeg = await sharp(png).removeAlpha().jpeg(NORMAL_MAP_JPEG).toBuffer();
    texture.setImage(new Uint8Array(jpeg)).setMimeType("image/jpeg");
    report.push({ texture: texture.getName() || "(unnamed)", pngBytes: png.length, jpegBytes: jpeg.length });
  }
  return report;
}

/** sha256 over every accessor's type, component type and data, in document order. */
export function geometryHash(doc) {
  const hash = createHash("sha256");
  for (const accessor of doc.getRoot().listAccessors()) {
    hash.update(`${accessor.getType()}:${accessor.getComponentType()}:${accessor.getNormalized()}:${accessor.getCount()};`);
    const array = accessor.getArray();
    if (array) hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
  return hash.digest("hex");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const app = join(dirname(fileURLToPath(import.meta.url)), "..");
  const repo = join(app, "..", "..");
  const rootRequire = createRequire(join(repo, "package.json"));
  const { NodeIO } = rootRequire("@gltf-transform/core");
  const { ALL_EXTENSIONS } = rootRequire("@gltf-transform/extensions");
  const sharp = rootRequire("sharp");
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const modelsDir = join(app, "src", "assets", "models");
  const provDir = join(app, "provenance", "models");
  const portraitsPath = join(app, "provenance", "portraits.json");
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
  const portraits = existsSync(portraitsPath) ? JSON.parse(readFileSync(portraitsPath, "utf8")) : {};

  const changed = [];
  for (const provFile of readdirSync(provDir).filter((f) => f.endsWith(".json")).sort()) {
    const provPath = join(provDir, provFile);
    const prov = JSON.parse(readFileSync(provPath, "utf8"));
    if (only && !only.has(prov.key)) continue;
    const oldPath = join(app, prov.file);
    if (!existsSync(oldPath)) throw new Error(`${prov.key}: ${prov.file} is missing`);
    const before = await io.read(oldPath);
    const geometryBefore = geometryHash(before);
    const textures = await jpegNormalMaps(before, sharp);
    if (textures.length === 0) continue;
    const bytes = Buffer.from(await io.writeBinary(before));
    const geometryAfter = geometryHash(await io.readBinary(new Uint8Array(bytes)));
    if (geometryAfter !== geometryBefore) throw new Error(`${prov.key}: geometry changed while re-encoding the normal map`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const file = `src/assets/models/${prov.key}.${sha256.slice(0, 8)}.glb`;
    rmSync(oldPath);
    writeFileSync(join(app, file), bytes);
    const previous = { file: prov.file, sha256: prov.sha256, sizeBytes: prov.sizeBytes };
    prov.file = file;
    prov.sha256 = sha256;
    prov.sizeBytes = bytes.length;
    prov.processing = {
      ...prov.processing,
      normalMapJpeg: { ...NORMAL_MAP_JPEG, encoder: "sharp", textures, geometrySha256: geometryBefore, previous }
    };
    writeFileSync(provPath, JSON.stringify(prov, null, 2));
    const portrait = portraits[prov.key];
    if (portrait && portrait.model === previous.file) {
      portrait.model = file;
      portrait.renderedFrom = `${previous.file}: the same model before its normal map was stored as JPEG`;
    }
    changed.push(`${prov.key}: ${(previous.sizeBytes / 1024).toFixed(0)} KB -> ${(bytes.length / 1024).toFixed(0)} KB (${file})`);
  }
  if (changed.length > 0) {
    writeFileSync(portraitsPath, `${JSON.stringify(portraits, null, 1)}\n`);
    execFileSync(process.execPath, [join(app, "tools", "gen-aura-assets.mjs")], { stdio: "inherit" });
    execFileSync(process.execPath, [join(app, "tools", "gen-rights-manifest.mjs")], { stdio: "inherit" });
  }
  console.log(changed.length > 0 ? changed.join("\n") : "jpeg-normal-maps: no PNG normal maps left");
}
