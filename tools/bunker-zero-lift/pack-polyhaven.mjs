#!/usr/bin/env node
// Packs a Poly Haven 1k glTF download into one GLB for Bunker Zero (GU47 phase 9, D2 owned CC0 props).
// No vertex edits: optional --keep <node,...> drops the other top-level nodes (a multi-variant file), then the scene is wrapped
// in a "root" node that recentres X/Z and grounds Y; unused textures/materials are pruned.
// --rotx <deg> turns the root node about X (node transform, e.g. a vertical blade laid along +Z like the viewmodel it replaces).
// Usage: node tools/bunker-zero-lift/pack-polyhaven.mjs <in.gltf> <out-dir> <name> [--keep a,b] [--rotx deg] [--info]
// Prints {"file","sizeBytes","sha256","min","max","nodes","triangles"}; the output is <out-dir>/<name>.<sha256-8>.glb.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds, prune } from "@gltf-transform/functions";

const [inFile, outDir, name, ...rest] = process.argv.slice(2);
const keepAt = rest.indexOf("--keep");
const keep = keepAt >= 0 ? rest[keepAt + 1].split(",") : null;
const info = rest.includes("--info");
const rotAt = rest.indexOf("--rotx");
const rotx = rotAt >= 0 ? (Number(rest[rotAt + 1]) * Math.PI) / 180 : 0;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inFile);
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const tops = scene.listChildren();
if (info) {
  for (const n of tops) {
    const b = getBounds(n);
    console.log(n.getName(), b.min.map((v) => v.toFixed(3)).join(","), b.max.map((v) => v.toFixed(3)).join(","));
  }
}
if (keep) for (const n of tops) if (!keep.includes(n.getName())) { scene.removeChild(n); n.dispose(); }
const root = doc.createNode("root");
for (const n of scene.listChildren()) { scene.removeChild(n); root.addChild(n); }
scene.addChild(root);
if (rotx) root.setRotation([Math.sin(rotx / 2), 0, 0, Math.cos(rotx / 2)]);
const b = getBounds(scene);
const t = root.getTranslation();
root.setTranslation([t[0] - (b.min[0] + b.max[0]) / 2, t[1] - b.min[1], t[2] - (b.min[2] + b.max[2]) / 2]);
await doc.transform(prune());
const fb = getBounds(scene);
let triangles = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) triangles += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
const glb = await io.writeBinary(doc);
const sha = createHash("sha256").update(glb).digest("hex");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${name}.${sha.slice(0, 8)}.glb`);
writeFileSync(file, glb);
console.log(JSON.stringify({ file, sizeBytes: glb.length, sha256: sha, min: fb.min.map((v) => +v.toFixed(3)), max: fb.max.map((v) => +v.toFixed(3)), nodes: scene.listChildren()[0].listChildren().map((n) => n.getName()), triangles, textures: doc.getRoot().listTextures().map((t) => `${t.getURI()} ${(t.getSize() ?? []).join("x")}`) }));
