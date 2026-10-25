// node cover.mjs <in.glb> <out.glb> '<json covers>' : covers = [{side:"front"|"rear", x, y, rx, ry, color:[r,g,b] (sRGB 0-255)}]
// Adds one thin plain-colour disc per cover just in front of (front) / behind (rear) the body surface at that spot.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const [inp, out, json] = process.argv.slice(2);
const covers = JSON.parse(json);
const doc = await io.read(inp);
const mesh = doc.getRoot().listMeshes()[0];
const base = mesh.listPrimitives()[0];
const pos = base.getAttribute("POSITION"), idx = base.getIndices();
const tris = [];
for (let t = 0; t < idx.getCount(); t += 3) tris.push([0, 1, 2].map((k) => pos.getElement(idx.getScalar(t + k), [0, 0, 0])));
// z of the body surface nearest the camera side at (x, y)
const surfaceX = (y, z, side) => {
  let best = side === "left" ? 1e9 : -1e9, hit = false;
  for (const [a, b, c] of tris) {
    const d = (b[2] - c[2]) * (a[1] - c[1]) + (c[1] - b[1]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue;
    const l1 = ((b[2] - c[2]) * (y - c[1]) + (c[1] - b[1]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (y - c[1]) + (a[1] - c[1]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    const x = l1 * a[0] + l2 * b[0] + l3 * c[0]; hit = true;
    best = side === "left" ? Math.min(best, x) : Math.max(best, x);
  }
  return hit ? best : null;
};
const surfaceZ = (x, y, side) => {
  let best = side === "front" ? 1e9 : -1e9, hit = false;
  for (const [a, b, c] of tris) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-12) continue;
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d, l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    const z = l1 * a[2] + l2 * b[2] + l3 * c[2]; hit = true;
    best = side === "front" ? Math.min(best, z) : Math.max(best, z);
  }
  return hit ? best : null;
};
const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const buffer = doc.getRoot().listBuffers()[0];
for (const [n, cv] of covers.entries()) {
  const SEG = 20;
  const side = cv.side, lateral = side === "left" || side === "right";
  // lateral covers: (y, z) is the centre, (ry, rz) the radii, disc lies in the YZ plane facing +-X
  const sample = (u, v) => (lateral ? surfaceX(u, v, side) : surfaceZ(u, v, side));
  const cu = lateral ? cv.y : cv.x, cvv = lateral ? cv.z : cv.y, ru = lateral ? cv.ry : cv.rx, rv = lateral ? cv.rz : cv.ry;
  const near = side === "front" || side === "left";
  let ds = [];
  for (let i = 0; i < 40; i++) { const ang = (i / 40) * Math.PI * 2; for (const f of [0.35, 0.7, 1]) { const d = sample(cu + Math.cos(ang) * ru * f, cvv + Math.sin(ang) * rv * f); if (d !== null) ds.push(d); } }
  const dc = sample(cu, cvv); if (dc !== null) ds.push(dc);
  if (!ds.length) { console.log("cover", n, "found no surface"); continue; }
  const protrude = near ? Math.min(...ds) : Math.max(...ds);
  const dep = protrude + (near ? -0.006 : 0.006);
  const sign = near ? -1 : 1;
  const at = (u, v) => (lateral ? [dep, u, v] : [u, v, dep]);
  const N = lateral ? [sign, 0, 0] : [0, 0, sign];
  const positions = [at(cu, cvv)], normals = [N], indices = [];
  for (let i = 0; i < SEG; i++) { const ang = (i / SEG) * Math.PI * 2; positions.push(at(cu + Math.cos(ang) * ru, cvv + Math.sin(ang) * rv)); normals.push(N); }
  const flipped = near;
  for (let i = 0; i < SEG; i++) { const a = 1 + i, b = 1 + ((i + 1) % SEG); indices.push(0, flipped ? b : a, flipped ? a : b); }
  const mat = doc.createMaterial(`cover${n}`).setBaseColorFactor([lin(cv.color[0]), lin(cv.color[1]), lin(cv.color[2]), 1]).setMetallicFactor(0).setRoughnessFactor(0.55);
  const flat = (a) => new Float32Array(a.flat());
  const prim = doc.createPrimitive().setMaterial(mat)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(flat(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(flat(normals)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer));
  mesh.addPrimitive(prim);
}
await io.write(out, doc);
console.log("covers", covers.length, "prims", mesh.listPrimitives().length);
