#!/usr/bin/env node
// Drops a GLB's self-glow (emissive texture and factor) and the image only it used, keeping geometry and the other maps.
// Bunker Zero's machine-gun viewmodel: the rifle GLB uses its colour map as emissive at factor 1, which blooms into a
// ghost in hand, and any material override on the in-hand model left it undrawn (GU47 phase 6), so the copy carries the fix.
// Usage: node tools/bunker-zero-lift/unglow.mjs <in.glb> <out-dir> <name>
// Prints {"file","sizeBytes","sha256"}; the output is <out-dir>/<name>.<sha256-8>.glb.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";

const [, , inFile, outDir, name] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: unglow.mjs <in.glb> <out-dir> <name>"); process.exit(2); }
const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
for (const mat of root.listMaterials()) {
  const tex = mat.getEmissiveTexture();
  mat.setEmissiveTexture(null);
  mat.setEmissiveFactor([0, 0, 0]);
  if (tex && tex.listParents().every((p) => p === root)) tex.dispose();
}
mkdirSync(outDir, { recursive: true });
const tmp = path.join(outDir, `${name}.tmp.glb`);
await io.write(tmp, doc);
const buf = readFileSync(tmp);
const sha = createHash("sha256").update(buf).digest("hex");
const file = path.join(outDir, `${name}.${sha.slice(0, 8)}.glb`);
renameSync(tmp, file);
console.log(JSON.stringify({ file, sizeBytes: buf.length, sha256: sha }));
