// IC-10: re-encode each fighter's 2048 px PNG base-colour atlas as WebP (EXT_texture_webp), leaving geometry, skin,
// animations and the small face texture untouched. Writes <id>.<sha8>.glb next to the source and prints a JSON report
// (old/new size and hash, position-accessor hash before and after) for aura.assets.json and the evidence folder.
// Usage (repo root): node apps/showcase-iron-crown/scripts/webp-atlases.mjs <out-dir> <quality> <glb>...
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const [outDir, qualityArg, ...files] = process.argv.slice(2);
const quality = Number(qualityArg) || 90;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function positionsHash(doc) {
  const h = createHash("sha256");
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) h.update(Buffer.from(prim.getAttribute("POSITION").getArray().buffer));
  return h.digest("hex").slice(0, 16);
}

const report = [];
for (const file of files) {
  const before = readFileSync(file);
  const doc = await io.readBinary(new Uint8Array(before));
  const posBefore = positionsHash(doc);
  let converted = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const size = tex.getSize();
    if (tex.getMimeType() !== "image/png" || !size || size[0] < 1024) continue;
    const webp = await sharp(Buffer.from(tex.getImage())).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    tex.setImage(new Uint8Array(webp)).setMimeType("image/webp");
    if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.png$/i, ".webp"));
    converted += 1;
  }
  if (converted > 0) doc.createExtension(EXTTextureWebP).setRequired(true);
  const out = Buffer.from(await io.writeBinary(doc));
  const check = await io.readBinary(new Uint8Array(out));
  const id = path.basename(file).split(".")[0];
  const hash = sha(out);
  const name = `${id}.${hash.slice(0, 8)}.glb`;
  writeFileSync(path.join(outDir, name), out);
  report.push({
    id, from: path.basename(file), to: name, converted,
    bytesBefore: before.length, bytesAfter: out.length, hash: `sha256-${hash}`,
    positionsBefore: posBefore, positionsAfter: positionsHash(check),
    animations: check.getRoot().listAnimations().length, joints: check.getRoot().listSkins()[0]?.listJoints().length ?? 0
  });
}
console.log(JSON.stringify(report, null, 2));
