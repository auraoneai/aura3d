// Slim Idol GLBs for Aura Diamond 3D in place: the optimiser keeps the normal map as a lossless PNG (about 2.5 MB at
// 1024 px), which dominates every file. Re-encode PNG textures as JPEG and cap the normal / metal-roughness maps at
// `--aux` px (base colour keeps its size), so a park's Idol set stays near the per-game byte budget.
//   node apps/showcase-aura-diamond-3d/scripts/idol-slim.mjs [--aux 1024] <file.glb> [...]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { statSync } from "node:fs";

const args = process.argv.slice(2);
const auxIdx = args.indexOf("--aux");
const aux = auxIdx >= 0 ? Number(args[auxIdx + 1]) : 1024;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--aux");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const file of files) {
  const before = statSync(file).size;
  const doc = await io.read(file);
  const root = doc.getRoot();
  const role = new Map();
  for (const m of root.listMaterials()) {
    if (m.getBaseColorTexture()) role.set(m.getBaseColorTexture(), "base");
    if (m.getNormalTexture()) role.set(m.getNormalTexture(), "normal");
    if (m.getMetallicRoughnessTexture()) role.set(m.getMetallicRoughnessTexture(), "mr");
    if (m.getOcclusionTexture()) role.set(m.getOcclusionTexture(), role.get(m.getOcclusionTexture()) ?? "mr");
  }
  for (const tex of root.listTextures()) {
    const kind = role.get(tex) ?? "base";
    const [w] = tex.getSize() ?? [0];
    const cap = kind === "base" ? w : Math.min(w, aux);
    if (tex.getMimeType() === "image/jpeg" && cap === w) continue;
    let img = sharp(Buffer.from(tex.getImage()));
    if (cap < w) img = img.resize(cap, cap);
    const out = await img.jpeg({ quality: kind === "normal" ? 92 : 88, chromaSubsampling: kind === "normal" ? "4:4:4" : "4:2:0" }).toBuffer();
    tex.setImage(new Uint8Array(out)).setMimeType("image/jpeg");
    if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.png$/i, ".jpg"));
  }
  await io.write(file, doc);
  console.log(`${file}: ${(before / 1e6).toFixed(2)} -> ${(statSync(file).size / 1e6).toFixed(2)} MB`);
}
