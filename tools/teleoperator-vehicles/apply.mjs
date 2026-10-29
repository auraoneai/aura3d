// Swap the Teleoperator vehicle GLBs for the generic Meshy-generated set.
// Usage: node tools/teleoperator-vehicles/apply.mjs <dir with <model>/oriented.glb> [--dry]
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const require = createRequire(join(root, "package.json"));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder } = require("meshoptimizer");

const [srcDir, ...flags] = process.argv.slice(2);
const dry = flags.includes("--dry");

const MODEL_FOR_KEY = {
  gridCruiser: "robotaxi",
  gridRivalCruiser: "robotaxi",
  gridCoupe: "hatch",
  gridTruck: "pickup",
  gridGt: "coupe",
  gridInterceptor: "roadster",
  gridSedan: "sedan",
  gridTaxi: "sedan",
  gridHatch: "hatch",
  gridVan: "van",
  gridPickup: "pickup",
  gridBoxTruck: "boxtruck"
};
const FILE_STEM = {
  robotaxi: "teleopVehRobotaxi",
  hatch: "teleopVehHatch",
  pickup: "teleopVehPickup",
  coupe: "teleopVehCoupe",
  roadster: "teleopVehRoadster",
  sedan: "teleopVehSedan",
  van: "teleopVehVan",
  boxtruck: "teleopVehBoxTruck"
};
const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), original text prompt, 2026-10-25";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const info = {};
for (const model of new Set(Object.values(MODEL_FOR_KEY))) {
  const covered = join(srcDir, model, "covered.glb");
  const file = existsSync(covered) ? covered : join(srcDir, model, "oriented.glb");
  if (!existsSync(file)) {
    console.log(`skip ${model}: no ${file}`);
    continue;
  }
  const buf = readFileSync(file);
  const sha = createHash("sha256").update(buf).digest("hex");
  const doc = await io.readBinary(new Uint8Array(buf));
  const min = [1e9, 1e9, 1e9];
  const max = [-1e9, -1e9, -1e9];
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : pos.getCount()) / 3;
      for (let i = 0; i < pos.getCount(); i++) {
        const v = pos.getElement(i, []);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], v[k]);
          max[k] = Math.max(max[k], v[k]);
        }
      }
    }
  const r = (n) => Math.round(n * 10000) / 10000;
  const stem = FILE_STEM[model];
  const name = `${stem}.${sha.slice(0, 8)}.glb`;
  info[model] = {
    name,
    sha,
    bytes: buf.length,
    tris: Math.round(tris),
    size: max.map((v, i) => r(v - min[i])),
    min: min.map(r),
    max: max.map(r),
    materials: doc.getRoot().listMaterials().length,
    textures: doc.getRoot().listTextures().length,
    nodes: doc.getRoot().listNodes().length,
    meshes: doc.getRoot().listMeshes().length,
    file
  };
  if (!dry) copyFileSync(file, join(root, "public/aura-assets", name));
}

// aura.assets.json
const jsonPath = join(root, "aura.assets.json");
const jsonText = readFileSync(jsonPath, "utf8");
const manifest = JSON.parse(jsonText);
// \uXXXX escapes in the committed file become literal characters on rewrite; any other drift is an error.
const canon = (t) => JSON.stringify(JSON.parse(t), null, 2);
if (canon(jsonText) + "\n" !== JSON.stringify(manifest, null, 2) + "\n") throw new Error("aura.assets.json parse mismatch");
for (const entry of manifest.assets) {
  const model = MODEL_FOR_KEY[entry.name];
  if (!model || !info[model]) continue;
  const m = info[model];
  entry.url = `/aura-assets/${m.name}`;
  entry.source = `public/aura-assets/${m.name}`;
  entry.sha256 = m.sha;
  entry.byteLength = m.bytes;
  entry.sizeBytes = m.bytes;
  entry.license = LICENSE;
  entry.nodeCount = m.nodes;
  entry.meshCount = m.meshes;
  entry.materialCount = m.materials;
  entry.textureCount = m.textures;
  entry.bounds = m.size;
  entry.boundsMetadata = { min: m.min, max: m.max };
}

// src/aura-assets.ts: rewrite the field values inside each key's block, keeping its shape.
const tsPath = join(root, "src/aura-assets.ts");
let ts = readFileSync(tsPath, "utf8");
for (const [key, model] of Object.entries(MODEL_FOR_KEY)) {
  const m = info[model];
  if (!m) continue;
  const start = ts.indexOf(`\n  "${key}": {\n`);
  if (start < 0) throw new Error(`block for ${key} not found`);
  const end = ts.indexOf("\n  },\n", start);
  let block = ts.slice(start, end);
  block = block.replace(/url: "[^"]*"/, `url: "/aura-assets/${m.name}"`);
  block = block.replace(/hash: "[^"]*"/, `hash: "sha256-${m.sha}"`);
  block = block.replace(/bounds: \[\s*[-\d.e]+,\s*[-\d.e]+,\s*[-\d.e]+\s*\]/, `bounds: [\n      ${m.size[0]},\n      ${m.size[1]},\n      ${m.size[2]}\n    ]`);
  block = block.replace(/sizeBytes: \d+/, `sizeBytes: ${m.bytes}`);
  block = block.replace(/"sourcePath": "[^"]*"/, `"sourcePath": "public/aura-assets/${m.name}"`);
  block = block.replace(
    /"boundsMetadata": \{\s*"min": \[[^\]]*\],\s*"max": \[[^\]]*\]\s*\}/,
    `"boundsMetadata": {\n        "min": [\n          ${m.min.join(",\n          ")}\n        ],\n        "max": [\n          ${m.max.join(",\n          ")}\n        ]\n      }`
  );
  ts = ts.slice(0, start) + block + ts.slice(end);
}

// app-local definitions in the Teleoperator app
const localEdits = [];
for (const file of ["apps/showcase-teleoperator/src/main.ts"]) {
  const p = join(root, file);
  if (!existsSync(p)) continue;
  let src = readFileSync(p, "utf8");
  for (const [key, model] of Object.entries(MODEL_FOR_KEY)) {
    const m = info[model];
    if (!m) continue;
    const re = new RegExp(`(  ${key}: \\{\\n    type: "model",\\n    format: "glb",\\n    url: )"[^"]*"(,\\n    hash: )"[^"]*"(,\\n    bounds: )\\[[^\\]]*\\]`);
    if (re.test(src)) {
      src = src.replace(re, `$1"/aura-assets/${m.name}"$2"sha256-${m.sha}"$3[${m.size.join(", ")}]`);
      localEdits.push(`${file}:${key}`);
    }
  }
  if (!dry) writeFileSync(p, src);
}

if (!dry) {
  writeFileSync(jsonPath, JSON.stringify(manifest, null, 2) + (jsonText.endsWith("\n") ? "\n" : ""));
  writeFileSync(tsPath, ts);
}
writeFileSync(join(root, "tools/teleoperator-vehicles/last-apply.json"), JSON.stringify({ info, localEdits }, null, 2) + "\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, { name: v.name, kb: Math.round(v.bytes / 1024), tris: v.tris, size: v.size.join("x") }])), null, 1));
console.log("local edits:", localEdits.length);
