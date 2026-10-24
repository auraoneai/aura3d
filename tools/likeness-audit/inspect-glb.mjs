import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [file, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const root = doc.getRoot();
const tag = basename(file).replace(/\.glb$/, "");
for (const mat of root.listMaterials()) {
  const slots = { base: mat.getBaseColorTexture(), mr: mat.getMetallicRoughnessTexture(), normal: mat.getNormalTexture(), emissive: mat.getEmissiveTexture(), occlusion: mat.getOcclusionTexture() };
  const bc = mat.getBaseColorFactor().map((v) => +v.toFixed(2));
  console.log(`${tag} material "${mat.getName()}" baseColor=${bc} alpha=${mat.getAlphaMode()}`, Object.entries(slots).filter(([, t]) => t).map(([k, t]) => `${k}:${t.getName() || "tex"} ${t.getSize()?.join("x")} ${t.getMimeType()}`).join(" | "));
}
let i = 0;
for (const tex of root.listTextures()) {
  const img = tex.getImage();
  if (!img) continue;
  const size = tex.getSize();
  const outName = `${outDir}/${tag}-${i}-${(tex.getName() || "tex").replace(/[^a-z0-9]/gi, "_")}.png`;
  await sharp(Buffer.from(img)).resize({ width: 1024, height: 1024, fit: "inside" }).png().toFile(outName);
  console.log("texture", i, tex.getName(), size?.join("x"), tex.getMimeType(), "->", outName);
  i++;
}
console.log(tag, "meshes", root.listMeshes().length, "nodes", root.listNodes().length);
