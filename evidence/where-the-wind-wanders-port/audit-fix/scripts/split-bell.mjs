#!/usr/bin/env node
// Split the Meshy belltower into the tower (bell removed) and the bell alone, so the bell can swing (audit WW-4).
// The bell (with its yoke and rope) is the second-largest connected component of the single mesh (1,074 of 27,088
// triangles, inside x -0.17..0.19, y -0.29..0.64, z 0.11..0.45 in file units). The bell file is re-centred on its pivot
// (the yoke, mean of its vertices above y 0.6) so a rotation of the node swings it from there.
// Usage: node split-bell.mjs <belltower.glb> <out-tower.glb> <out-bell.glb>
import { createRequire } from "node:module";
import { statSync } from "node:fs";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune, compactPrimitive } = require("@gltf-transform/functions");

const [input, outTower, outBell] = process.argv.slice(2);
if (!input || !outTower || !outBell) { console.error("usage: split-bell.mjs <in> <tower-out> <bell-out>"); process.exit(2); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function components(prim) {
  const pos = prim.getAttribute("POSITION").getArray();
  const idx = prim.getIndices().getArray();
  const n = pos.length / 3;
  const key = new Map();
  const weld = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${pos[3 * i].toFixed(5)},${pos[3 * i + 1].toFixed(5)},${pos[3 * i + 2].toFixed(5)}`;
    if (!key.has(k)) key.set(k, key.size);
    weld[i] = key.get(k);
  }
  const parent = Int32Array.from({ length: key.size }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(weld[idx[t]]), b = find(weld[idx[t + 1]]), c = find(weld[idx[t + 2]]);
    parent[b] = a; parent[find(c)] = a;
  }
  const triRoot = new Int32Array(idx.length / 3);
  const sizes = new Map();
  for (let t = 0; t < idx.length; t += 3) { const r = find(weld[idx[t]]); triRoot[t / 3] = r; sizes.set(r, (sizes.get(r) ?? 0) + 1); }
  const ranked = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
  return { pos, idx, triRoot, bellRoot: ranked[1][0], bellTris: ranked[1][1], totalTris: idx.length / 3 };
}

async function cut(keepBell, out) {
  const doc = await io.read(input);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const { pos, idx, triRoot, bellRoot, bellTris, totalTris } = components(prim);
  const kept = [];
  for (let t = 0; t < triRoot.length; t++) if ((triRoot[t] === bellRoot) === keepBell) kept.push(idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]);
  prim.getIndices().setArray(new Uint32Array(kept));
  compactPrimitive(prim);
  let pivot = null;
  if (keepBell) {
    const p = prim.getAttribute("POSITION");
    const arr = p.getArray().slice();
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (let i = 0; i < arr.length; i += 3) if (arr[i + 1] > 0.6) { sx += arr[i]; sy += arr[i + 1]; sz += arr[i + 2]; m++; }
    pivot = [sx / m, sy / m, sz / m];
    for (let i = 0; i < arr.length; i += 3) { arr[i] -= pivot[0]; arr[i + 1] -= pivot[1]; arr[i + 2] -= pivot[2]; }
    p.setArray(arr);
  }
  await doc.transform(prune());
  await io.write(out, doc);
  return { out, bytes: statSync(out).size, tris: kept.length / 3, bellTris, totalTris, pivot };
}

console.log(JSON.stringify({ tower: await cut(false, outTower), bell: await cut(true, outBell) }, null, 1));
