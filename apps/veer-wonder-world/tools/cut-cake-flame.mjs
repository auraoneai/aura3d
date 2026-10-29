#!/usr/bin/env node
// Cuts the modelled candle flame (and its wick) off the admitted cake model, so E16 can light and blow out the
// separate procedural `candleFlame` prop that rests on the candle (stand-ins.ts; the cake is a surface whose rest
// height is its top). Every triangle whose centroid lies above the candle's top rim goes; unused vertices go too.
// The profile of the original model (radius around the candle axis per height band, model units): the candle is a
// 0.05-radius stick up to y = 0.624, the wick narrows to 0.015 at 0.65, and the flame spans 0.66-0.95.
//
//   node apps/veer-wonder-world/tools/cut-cake-flame.mjs <in.glb> <out.glb> [--cut-y 0.632]
// Prints a JSON report ({ cutY, trianglesBefore, trianglesAfter, verticesAfter, boundsY }).
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(repo, "package.json"));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune, compactPrimitive } = require("@gltf-transform/functions");

const args = process.argv.slice(2);
const [input, output] = args.filter((a) => !a.startsWith("--"));
const cutAt = args.indexOf("--cut-y");
const cutY = cutAt >= 0 ? Number(args[cutAt + 1]) : 0.632;
if (!input || !output || !Number.isFinite(cutY)) throw new Error("usage: cut-cake-flame.mjs <in.glb> <out.glb> [--cut-y 0.632]");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const meshes = doc.getRoot().listMeshes();
if (meshes.length !== 1 || meshes[0].listPrimitives().length !== 1) throw new Error("expected one mesh with one primitive");
const prim = meshes[0].listPrimitives()[0];
const pos = prim.getAttribute("POSITION");
const indices = prim.getIndices();
if (!indices) throw new Error("expected an indexed primitive");
const before = indices.getCount() / 3;
const kept = [];
const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
for (let t = 0; t < before; t += 1) {
  const i0 = indices.getScalar(3 * t), i1 = indices.getScalar(3 * t + 1), i2 = indices.getScalar(3 * t + 2);
  pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c);
  if ((a[1] + b[1] + c[1]) / 3 > cutY) continue;
  kept.push(i0, i1, i2);
}
const ArrayType = indices.getArray().constructor;
indices.setArray(new ArrayType(kept));
compactPrimitive(prim);
await doc.transform(prune());
let minY = Infinity, maxY = -Infinity;
const p = [0, 0, 0];
const after = prim.getAttribute("POSITION");
for (let i = 0; i < after.getCount(); i += 1) { after.getElement(i, p); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
await io.write(output, doc);
console.log(JSON.stringify({ cutY, trianglesBefore: before, trianglesAfter: kept.length / 3, verticesAfter: after.getCount(), boundsY: [minY, maxY] }));
