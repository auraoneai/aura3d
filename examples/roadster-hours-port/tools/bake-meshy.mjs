#!/usr/bin/env node
// Bakes the Meshy-generated, prepared GLBs (artifacts/meshy/rr-<key>/model.glb, see PORTING-NOTES.md) into a compact binary
// geometry file (Int16 positions, Int8 normals, Float32 uvs, Uint16/32 indices) plus a base-colour JPEG per model under assets/meshy/.
// Vehicles are stretched into the unit box [-0.5, 0.5]^3 with the front at -Z (the sim's convention), props are scaled to
// height 1 with the base at y = 0 and the footprint centred. Output: ../meshy.baked.ts (a generated module, do not edit).
// Usage (repo root): node examples/roadster-hours-port/tools/bake-meshy.mjs
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const require = createRequire(resolve(root, "package.json"));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder } = require("meshoptimizer");
const sharp = require("sharp");

/** kind: vehicle (unit-box, front -Z) | prop (height 1, base y=0). flip: rotate 180 degrees about Y. dims: native metres [w, h, l] for vehicles, [w, h, d] for props. */
const MODELS = JSON.parse(readFileSync(resolve(here, "meshy-models.json"), "utf8"));

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
mkdirSync(resolve(here, "../assets/meshy"), { recursive: true });

const mulPoint = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const mulDir = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];

const out = {};
const assets = [];
for (const spec of MODELS) {
  const glb = resolve(root, spec.glb);
  if (!existsSync(glb)) { console.warn(`skip ${spec.key}: ${spec.glb} missing`); continue; }
  const doc = await io.read(glb);
  const positions = [], normals = [], uvs = [], indices = [];
  let texture = null;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute("POSITION"), na = prim.getAttribute("NORMAL"), ta = prim.getAttribute("TEXCOORD_0");
      if (!pa) continue;
      const base = positions.length / 3;
      const count = pa.getCount(), v3 = [0, 0, 0], v2 = [0, 0];
      for (let i = 0; i < count; i++) {
        pa.getElement(i, v3);
        positions.push(...mulPoint(m, v3[0], v3[1], v3[2]));
        if (na) { na.getElement(i, v3); const n = mulDir(m, v3[0], v3[1], v3[2]); const l = Math.hypot(...n) || 1; normals.push(n[0] / l, n[1] / l, n[2] / l); } else normals.push(0, 1, 0);
        if (ta) { ta.getElement(i, v2); uvs.push(v2[0], v2[1]); } else uvs.push(0, 0);
      }
      const ia = prim.getIndices();
      if (ia) for (let i = 0; i < ia.getCount(); i++) indices.push(base + ia.getScalar(i));
      else for (let i = 0; i < count; i++) indices.push(base + i);
      const tex = prim.getMaterial()?.getBaseColorTexture();
      if (tex && !texture) texture = tex;
    }
  }
  if (!positions.length) { console.warn(`skip ${spec.key}: no geometry`); continue; }
  const n = positions.length / 3;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], positions[i * 3 + c]); hi[c] = Math.max(hi[c], positions[i * 3 + c]); }
  // Orient: longest horizontal axis becomes Z (vehicles); props keep their axes.
  let swapXZ = false;
  if (spec.kind === "vehicle") swapXZ = (hi[0] - lo[0]) > (hi[2] - lo[2]);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    let nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    if (swapXZ) { [x, z] = [z, -x]; [nx, nz] = [nz, -nx]; }
    if (spec.flip) { x = -x; z = -z; nx = -nx; nz = -nz; }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
  }
  const lo2 = [Infinity, Infinity, Infinity], hi2 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { lo2[c] = Math.min(lo2[c], P[i * 3 + c]); hi2[c] = Math.max(hi2[c], P[i * 3 + c]); }
  const U = new Float64Array(n * 3);
  const dims = spec.dims;
  let ext = 0;
  for (let i = 0; i < n; i++) {
    let u, v, w;
    if (spec.kind === "vehicle") {
      u = (P[i * 3] - lo2[0]) / (hi2[0] - lo2[0]) - 0.5; v = (P[i * 3 + 1] - lo2[1]) / (hi2[1] - lo2[1]) - 0.5; w = (P[i * 3 + 2] - lo2[2]) / (hi2[2] - lo2[2]) - 0.5;
    } else {
      const s = 1 / (hi2[1] - lo2[1]);
      u = (P[i * 3] - (lo2[0] + hi2[0]) / 2) * s; v = (P[i * 3 + 1] - lo2[1]) * s; w = (P[i * 3 + 2] - (lo2[2] + hi2[2]) / 2) * s;
    }
    U[i * 3] = u; U[i * 3 + 1] = v; U[i * 3 + 2] = w;
    ext = Math.max(ext, Math.abs(u), Math.abs(v), Math.abs(w));
  }
  const Q = new Int16Array(n * 3);
  for (let i = 0; i < n * 3; i++) Q[i] = Math.round((U[i] / ext) * 32767);
  const NN = new Int8Array(n * 3);
  for (let i = 0; i < n * 3; i++) NN[i] = Math.round(Math.max(-1, Math.min(1, N[i])) * 127);
  const UV = new Float32Array(uvs);
  const IDX = n < 65536 ? Uint16Array.from(indices) : Uint32Array.from(indices);
  let size = dims;
  if (spec.kind === "prop") { const aspect = [(hi2[0] - lo2[0]) / (hi2[1] - lo2[1]), 1, (hi2[2] - lo2[2]) / (hi2[1] - lo2[1])]; size = aspect.map((a) => a * dims[1]); }
  const pad4 = (len) => (4 - (len % 4)) % 4;
  const parts = [Buffer.from(Q.buffer), Buffer.from(NN.buffer), Buffer.alloc(pad4(NN.byteLength)), Buffer.from(UV.buffer), Buffer.from(IDX.buffer)];
  writeFileSync(resolve(here, `../assets/meshy/${spec.key}.bin`), Buffer.concat(parts));
  out[spec.key] = { key: spec.key, kind: spec.kind, vertices: n, triangles: indices.length / 3, size, ext, uint32: IDX instanceof Uint32Array, source: spec.glb };
  // texture
  let hash = null;
  if (texture) {
    const img = texture.getImage();
    const jpg = await sharp(Buffer.from(img)).resize({ width: spec.tex ?? 1024, height: spec.tex ?? 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
    const file = resolve(here, `../assets/meshy/${spec.key}.jpg`);
    writeFileSync(file, jpg);
    hash = createHash("sha256").update(jpg).digest("hex");
    assets.push({ key: spec.key, hash, bytes: jpg.length });
  }
  console.log(`${spec.key}: ${n} verts, ${indices.length / 3} tris, swapXZ=${swapXZ}, flip=${!!spec.flip}, tex=${hash ? "yes" : "no"}`);
}

const lines = [
  "/* GENERATED by tools/bake-meshy.mjs from the prepared Meshy GLBs (see PORTING-NOTES.md); do not edit. */",
  `import { defineAuraAssets } from "@aura3d/engine";`,
  "export interface MeshyBaked { key: string; kind: \"vehicle\" | \"prop\"; vertices: number; triangles: number; size: [number, number, number]; ext: number; uint32: boolean; source: string }",
  "/* same-origin pathnames + sha256: the production bridge refuses http(s) URLs and unhashed assets */",
  "export const MESHY_ASSETS = defineAuraAssets({",
  ...assets.map((a) => `  ${a.key}: { type: "texture", format: "jpg", url: new URL("./assets/meshy/${a.key}.jpg", import.meta.url).pathname, hash: "sha256-${a.hash}", metadata: { license: "Meshy generated texture (AuraOne account plan terms at generation time), original text prompt" } },`),
  "});",
  `export const MESHY_MODELS: Record<string, MeshyBaked> = ${JSON.stringify(out)};`,
  "/* binary geometry (Int16 positions, Int8 normals padded to 4, Float32 uvs, Uint16/32 indices), same-origin, fetched at boot */",
  "export const MESHY_BINS: Record<string, string> = {",
  ...Object.keys(out).map((k) => `  ${k}: new URL("./assets/meshy/${k}.bin", import.meta.url).pathname,`),
  "};",
  ""
];
writeFileSync(resolve(here, "../meshy.baked.ts"), lines.join("\n"));
console.log(`wrote meshy.baked.ts (${Object.keys(out).length} models, ${(lines.join("\n").length / 1024).toFixed(0)} KB)`);
