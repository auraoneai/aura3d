#!/usr/bin/env node
// Splits each rigid Idol critter (assets/idol/hopCritter*.glb, facing +Z, feet at y = 0) into a body plus named,
// pivoted part nodes (head, ears, wings or arms, legs or feet, tail, gills) so code can pose them every frame through
// `handle.setAnimationPose({ bones: { <partName>: { rotation } } })`. Same for the hawk's wings. Triangles go to the
// first region whose test their centroid passes (parts nest: ears inside the head and so on), and each part's mesh is
// re-centred on its pivot so a node rotation turns it about the joint. Writes the GLBs in place (originals kept as
// <key>.rigid.glb under artifacts/idol/cross-hop/<key>/) and src/game/critterParts.json (part names, parents,
// pivots, motion kind) for src/game/critterRig.ts.
//   node apps/showcase-cross-hop/scripts/split-idol-critters.mjs
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(appDir, "../..");
const req = createRequire(resolve(root, "tools/idol/normalize.mjs"));
const { NodeIO, Primitive } = await import(pathToFileURL(req.resolve("@gltf-transform/core")).href);
const { ALL_EXTENSIONS } = await import(pathToFileURL(req.resolve("@gltf-transform/extensions")).href);
const { prune } = await import(pathToFileURL(req.resolve("@gltf-transform/functions")).href);

// Region tests use normalised coordinates: h = y / height, u = x / bandHalfWidth (band = the part's height range,
// so a thin arm beside a wide cap still reads as "outer"), v = z / halfLength (+v = front). `side` splits left (+x)
// and right (-x) copies. Motions: leg, wing, arm, ear, tail, head, gill (see critterRig.ts).
const S = (name, test, pivot, motion, extra = {}) => ({ name, test, pivot, motion, ...extra });
const pair = (base, motion, band, inner, pivotH, opts = {}) => ["L", "R"].map((side) => {
  const s = side === "L" ? 1 : -1;
  return {
    name: `${base}${side}`, motion, side: s, parent: opts.parent,
    band, test: (p) => p.h >= band[0] && p.h <= band[1] && s * p.u >= inner && (opts.v ? opts.v(p.v) : true),
    pivot: { h: pivotH, u: s * inner, v: opts.pivotV ?? 0 }
  };
});
const quad = (base, motion, band, inner, vSplit, pivotH) => ["FL", "FR", "BL", "BR"].map((k) => {
  const s = k[1] === "L" ? 1 : -1, f = k[0] === "F" ? 1 : -1;
  return {
    name: `${base}${k}`, motion, side: s, front: f, band,
    test: (p) => p.h >= band[0] && p.h <= band[1] && s * p.u >= inner && f * p.v >= vSplit,
    pivot: { h: pivotH, u: s * (inner + 0.25), v: f * (vSplit + 0.35) }
  };
});
const head = (h0, opts = {}) => ({ name: "head", motion: "head", band: [h0, 1.01], test: (p) => p.h >= h0 && (opts.v ? opts.v(p.v) : true), pivot: { h: h0, u: 0, v: opts.pivotV ?? 0 } });
const tail = (vMax, band) => ({ name: "tail", motion: "tail", band, test: (p) => p.v <= vMax && p.h >= band[0] && p.h <= band[1], pivot: { h: (band[0] + band[1]) / 2, u: 0, v: vMax } });

// Heads are split only where a neck separates them (the turtle): on the round toy bodies a turning head opens a visible
// crack at the cut, so those critters move their limbs, ears, wings, gills and tails instead.
const RECIPES = {
  hopCritterHop: [...pair("leg", "leg", [0, 0.36], 0.42, 0.3, { v: (v) => v < 0.35 })],
  hopCritterGoldenHop: [...pair("leg", "leg", [0, 0.36], 0.42, 0.3, { v: (v) => v < 0.35 })],
  hopCritterRoboFrog: [...pair("leg", "leg", [0, 0.48], 0.45, 0.42)],
  hopCritterChick: [...pair("wing", "wing", [0.28, 0.64], 0.72, 0.6), ...pair("foot", "leg", [0, 0.11], 0.04, 0.11)],
  hopCritterDucky: [...pair("wing", "wing", [0.22, 0.56], 0.62, 0.52), ...pair("foot", "leg", [0, 0.11], 0.04, 0.11), tail(-0.55, [0.14, 0.5])],
  hopCritterTurtle: [head(0.28, { v: (v) => v > 0.5, pivotV: 0.5 }), ...quad("leg", "leg", [0, 0.24], 0.3, 0.1, 0.22)],
  hopCritterBun: [...pair("ear", "ear", [0.68, 1.01], 0.08, 0.68), ...pair("foot", "leg", [0, 0.12], 0.05, 0.12), tail(-0.68, [0.05, 0.4])],
  hopCritterAxolotl: [...pair("gill", "gill", [0.5, 1.01], 0.55, 0.72), tail(-0.25, [0, 0.4]), ...pair("foot", "leg", [0, 0.12], 0.05, 0.12, { v: (v) => v > -0.25 })],
  hopCritterToastCat: [...pair("ear", "ear", [0.87, 1.01], 0.42, 0.87), tail(-0.4, [0.05, 0.7]), ...pair("foot", "leg", [0, 0.1], 0.05, 0.1, { v: (v) => v > -0.4 })],
  hopCritterMushroomKid: [...pair("arm", "arm", [0.2, 0.42], 0.62, 0.4), ...pair("foot", "leg", [0, 0.14], 0.04, 0.14)],
  // the shield and sword cross the arm band, so the knight steps with its feet only
  hopCritterKnightToad: [...pair("foot", "leg", [0, 0.12], 0.05, 0.12)],
  hopCritterAstroFrog: [...pair("arm", "arm", [0.24, 0.68], 0.5, 0.64), ...pair("leg", "leg", [0, 0.3], 0.03, 0.3)],
  hopHawk: [...pair("wing", "wing", [0, 1.01], 0.24, 0.6, { v: (v) => v > -0.45 && v < 0.55 })]
};

async function split(key, recipe) {
  const file = resolve(appDir, `assets/idol/${key}.glb`);
  const work = resolve(root, `artifacts/idol/cross-hop/${key}`);
  mkdirSync(work, { recursive: true });
  const rigid = resolve(work, `${key}.rigid.glb`);
  if (!existsSync(rigid)) copyFileSync(file, rigid);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(rigid);
  const r = doc.getRoot();
  const scene = r.getDefaultScene() ?? r.listScenes()[0];
  const srcNode = r.listNodes().find((n) => n.getMesh());
  const prim = srcNode.getMesh().listPrimitives()[0];
  const pos = prim.getAttribute("POSITION");
  const N = pos.getCount();
  const P = new Float32Array(N * 3); { const v = [0, 0, 0]; for (let i = 0; i < N; i++) { pos.getElement(i, v); P.set(v, i * 3); } }
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i * 3 + k]); hi[k] = Math.max(hi[k], P[i * 3 + k]); }
  const H = hi[1] - lo[1], halfL = (hi[2] - lo[2]) / 2, cz = (hi[2] + lo[2]) / 2, cx = (hi[0] + lo[0]) / 2;
  // band half-widths (per part height band)
  const bandHalf = (band) => { let m = 1e-6; for (let i = 0; i < N; i++) { const h = (P[i * 3 + 1] - lo[1]) / H; if (h >= band[0] && h <= band[1]) m = Math.max(m, Math.abs(P[i * 3] - cx)); } return m; };
  const parts = recipe.map((p) => ({ ...p, half: bandHalf(p.band) }));
  const idx = prim.getIndices().getArray();
  const T = idx.length / 3;
  const owner = new Int16Array(T).fill(-1);
  for (let t = 0; t < T; t++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const i = idx[t * 3 + k]; x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; }
    x /= 3; y /= 3; z /= 3;
    const h = (y - lo[1]) / H, v = (z - cz) / halfL;
    // children (e.g. ears) are tested before their parent so they win the overlap
    const order = parts.map((p, k) => k).sort((a, b) => (parts[b].parent ? 1 : 0) - (parts[a].parent ? 1 : 0));
    for (const k of order) { const p = parts[k]; if (p.test({ h, u: (x - cx) / p.half, v })) { owner[t] = k; break; } }
  }
  const pivots = parts.map((p) => [cx + p.pivot.u * p.half, lo[1] + p.pivot.h * H, cz + p.pivot.v * halfL]);
  const attrs = prim.listSemantics().map((s) => [s, prim.getAttribute(s)]);
  const material = prim.getMaterial();
  const buffer = r.listBuffers()[0];
  function buildMesh(name, part, offset) {
    const tris = []; for (let t = 0; t < T; t++) if (owner[t] === part) tris.push(t);
    if (!tris.length) return null;
    const remap = new Map(); const order = [];
    const ind = new Uint32Array(tris.length * 3);
    tris.forEach((t, n) => { for (let k = 0; k < 3; k++) { const i = idx[t * 3 + k]; if (!remap.has(i)) { remap.set(i, order.length); order.push(i); } ind[n * 3 + k] = remap.get(i); } });
    const np = doc.createPrimitive().setMaterial(material).setIndices(doc.createAccessor().setType("SCALAR").setArray(ind).setBuffer(buffer));
    for (const [sem, acc] of attrs) {
      const size = acc.getElementSize(); const src = acc.getArray(); const out = new Float32Array(order.length * size);
      order.forEach((i, n) => { for (let k = 0; k < size; k++) out[n * size + k] = src[i * size + k]; });
      if (sem === "POSITION") for (let n = 0; n < order.length; n++) for (let k = 0; k < 3; k++) out[n * 3 + k] -= offset[k];
      np.setAttribute(sem, doc.createAccessor().setType(acc.getType()).setArray(out).setBuffer(buffer));
    }
    return { mesh: doc.createMesh(name).addPrimitive(np), tris: tris.length };
  }
  const rootNode = doc.createNode("critter");
  const bodyBuilt = buildMesh("body", -1, [0, 0, 0]);
  const bodyNode = doc.createNode("body").setMesh(bodyBuilt.mesh);
  rootNode.addChild(bodyNode);
  const nodes = {};
  const meta = [];
  // parents first
  const ordered = parts.map((p, k) => k).sort((a, b) => (parts[a].parent ? 1 : 0) - (parts[b].parent ? 1 : 0));
  for (const k of ordered) {
    const p = parts[k];
    const built = buildMesh(p.name, k, pivots[k]);
    if (!built) throw new Error(`${key}: part ${p.name} got no triangles`);
    const parentPivot = p.parent ? pivots[parts.findIndex((q) => q.name === p.parent)] : [0, 0, 0];
    const node = doc.createNode(p.name).setMesh(built.mesh).setTranslation([0, 1, 2].map((i) => pivots[k][i] - parentPivot[i]));
    (p.parent ? nodes[p.parent] : rootNode).addChild(node);
    nodes[p.name] = node;
    meta.push({ name: p.name, motion: p.motion, parent: p.parent ?? null, side: p.side ?? 0, front: p.front ?? 0, pivot: pivots[k].map((v) => Math.round(v * 1000) / 1000), triangles: built.tris });
  }
  for (const c of scene.listChildren()) scene.removeChild(c);
  scene.addChild(rootNode);
  srcNode.dispose();
  await doc.transform(prune());
  await io.write(file, doc);
  const bodyTris = bodyBuilt.tris;
  console.log(key.padEnd(22), `body ${bodyTris} tris;`, meta.map((m) => `${m.name}:${m.triangles}`).join(" "));
  return { height: Math.round(H * 1000) / 1000, parts: meta };
}

const out = {};
for (const [key, recipe] of Object.entries(RECIPES)) out[key] = await split(key, recipe);
writeFileSync(resolve(appDir, "src/game/critterParts.json"), JSON.stringify(out, null, 2) + "\n");
