#!/usr/bin/env node
// Stand-in for the B1 bridge command, used by the C1 dry run until B1 ships (AGENT_EVAL_BRIDGE_CMD points at the real one).
// It implements the same contract the bridge arm is told about in c1/bridge-guide.md, at minimum fidelity:
//   node mock-bridge.mjs three <src/bridge/x.factory.ts> --out public/aura-assets/bridge --name <id> --seed <n> --json
// (cwd = the sandbox). It transpiles the factory, runs it with the sandbox's three.js and a fixed seed, bakes every mesh's
// world transform, writes a GLB (positions, normals, indices, one PBR material per mesh), a supported / approximated /
// unsupported report, and the typed module src/bridge/assets.ts. Textures, clips and custom shaders are reported, never
// converted. No network, no browser.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function parse(argv) {
  const [mode, factory, ...rest] = argv;
  const opts = { mode, factory, out: "public/aura-assets/bridge", name: null, seed: 1, json: false };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--out") opts.out = rest[++i];
    else if (rest[i] === "--name") opts.name = rest[++i];
    else if (rest[i] === "--seed") opts.seed = Number(rest[++i]);
    else if (rest[i] === "--json") opts.json = true;
  }
  opts.name ||= basename(String(factory)).replace(/\.factory\.[tj]s$/, "").replace(/\.[tj]s$/, "");
  return opts;
}

/** Minimal glTF 2.0 binary writer: one node + mesh + material per input mesh. */
export function writeGlb(meshes) {
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const push = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };
  const gltf = { asset: { version: "2.0", generator: "aura3d-c1-mock-bridge" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], extensionsUsed: [] };
  for (const m of meshes) {
    const n = m.positions.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i += 1) for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], m.positions[i * 3 + k]);
      max[k] = Math.max(max[k], m.positions[i * 3 + k]);
    }
    accessors.push({ bufferView: push(m.positions, 34962), componentType: 5126, count: n, type: "VEC3", min, max });
    const pos = accessors.length - 1;
    accessors.push({ bufferView: push(m.normals, 34962), componentType: 5126, count: n, type: "VEC3" });
    const nor = accessors.length - 1;
    accessors.push({ bufferView: push(m.indices, 34963), componentType: 5125, count: m.indices.length, type: "SCALAR" });
    const idx = accessors.length - 1;
    const mat = m.material;
    const material = {
      name: mat.name,
      pbrMetallicRoughness: { baseColorFactor: [...mat.color, mat.opacity], metallicFactor: mat.metalness, roughnessFactor: mat.roughness },
      ...(mat.opacity < 1 ? { alphaMode: "BLEND" } : {}),
      doubleSided: mat.doubleSided
    };
    const peak = Math.max(...mat.emissive);
    if (peak > 0) {
      material.emissiveFactor = mat.emissive.map((c) => (peak > 1 ? c / peak : c));
      if (peak > 1) {
        material.extensions = { KHR_materials_emissive_strength: { emissiveStrength: peak } };
        if (!gltf.extensionsUsed.includes("KHR_materials_emissive_strength")) gltf.extensionsUsed.push("KHR_materials_emissive_strength");
      }
    }
    gltf.materials.push(material);
    gltf.meshes.push({ name: m.name, primitives: [{ attributes: { POSITION: pos, NORMAL: nor }, indices: idx, material: gltf.materials.length - 1 }] });
    gltf.nodes.push({ name: m.name, mesh: gltf.meshes.length - 1 });
    gltf.scenes[0].nodes.push(gltf.nodes.length - 1);
  }
  if (!gltf.extensionsUsed.length) delete gltf.extensionsUsed;
  gltf.accessors = accessors;
  gltf.bufferViews = bufferViews;
  gltf.buffers = [{ byteLength: offset }];
  const bin = Buffer.concat(chunks);
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(json.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, json, bh, bin]);
}

/** Walk a three.js scene: bake meshes, sort everything else into the report. */
export function collect(root, THREE) {
  const report = { supported: [], approximated: [], unsupported: [] };
  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const id = obj.name || `${obj.type}-${obj.id}`;
    if (obj.isMesh && !obj.isSkinnedMesh && !obj.isInstancedMesh) {
      if (!obj.visible) report.approximated.push({ id, what: "hidden mesh exported visible" });
      let geo = obj.geometry.clone();
      geo.applyMatrix4(obj.matrixWorld);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const positions = Float32Array.from(geo.attributes.position.array);
      const normals = Float32Array.from(geo.attributes.normal.array);
      const indices = geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
      const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const material = { name: src?.name || `${id}-material`, color: [1, 1, 1], opacity: 1, metalness: 0, roughness: 1, emissive: [0, 0, 0], doubleSided: false };
      if (src?.isMeshStandardMaterial || src?.isMeshPhysicalMaterial) {
        Object.assign(material, { color: src.color.toArray(), opacity: src.transparent ? src.opacity : 1, metalness: src.metalness, roughness: src.roughness, doubleSided: src.side === THREE.DoubleSide });
        material.emissive = src.emissive.toArray().map((c) => c * (src.emissiveIntensity ?? 1));
        if (src.isMeshPhysicalMaterial && (src.transmission > 0 || src.clearcoat > 0)) report.approximated.push({ id, what: "physical extras (transmission/clearcoat) dropped" });
        report.supported.push({ id, what: "mesh + standard material" });
      } else if (src?.color) {
        material.color = src.color.toArray();
        report.approximated.push({ id, what: `${src.type} mapped to rough PBR` });
      } else {
        report.unsupported.push({ id, what: `material ${src?.type ?? "none"} not converted` });
      }
      if (src?.map || src?.normalMap || src?.roughnessMap) report.approximated.push({ id, what: "texture maps dropped (bake to vertex colour or author natively)" });
      if (Array.isArray(obj.material) && obj.material.length > 1) report.approximated.push({ id, what: "multi-material mesh: first material only" });
      meshes.push({ name: id, positions, normals, indices, material });
    } else if (obj.isSkinnedMesh || obj.isInstancedMesh || obj.isPoints || obj.isLine || obj.isSprite) {
      report.unsupported.push({ id, what: `${obj.type} not exported` });
    } else if (obj.isLight || obj.isCamera) {
      report.unsupported.push({ id, what: `${obj.type} ignored: lights and cameras stay native` });
    }
  });
  return { meshes, report };
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const cwd = process.cwd();
  if (opts.mode !== "three") throw new Error("usage: mock-bridge three <factory.ts> --out DIR --name ID --seed N --json");
  const factoryPath = resolve(cwd, opts.factory);
  if (!factoryPath.startsWith(join(cwd, "src", "bridge"))) throw new Error("factory must live under src/bridge/");
  if (!existsSync(factoryPath)) throw new Error(`factory not found: ${opts.factory}`);
  const source = readFileSync(factoryPath, "utf8");
  const ts = createRequire(join(cwd, "package.json"))("typescript");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const cache = join(cwd, ".bridge-cache");
  mkdirSync(cache, { recursive: true });
  const modFile = join(cache, `${opts.name}-${Date.now()}.mjs`);
  writeFileSync(modFile, js);
  let result;
  try {
    const mod = await import(pathToFileURL(modFile).href);
    const THREE = await import(pathToFileURL(createRequire(join(cwd, "package.json")).resolve("three")).href);
    if (typeof mod.default !== "function") throw new Error("factory must `export default function (ctx: { seed: number }) { return { scene } }`");
    const made = await mod.default({ seed: opts.seed });
    if (!made?.scene?.isObject3D) throw new Error("factory must return { scene: THREE.Object3D, clips?: THREE.AnimationClip[] }");
    const { meshes, report } = collect(made.scene, THREE);
    for (const clip of made.clips ?? []) report.unsupported.push({ id: clip.name, what: "animation clip export is not in the mock bridge" });
    if (!meshes.length) throw new Error("factory scene has no exportable meshes");
    const glb = writeGlb(meshes);
    const outDir = resolve(cwd, opts.out);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${opts.name}.glb`), glb);
    const sha256 = createHash("sha256").update(glb).digest("hex");
    const manifestFile = join(outDir, "manifest.json");
    const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
    const publicRel = outDir.slice(join(cwd, "public").length).replaceAll("\\", "/");
    manifest[opts.name] = {
      url: `${publicRel}/${opts.name}.glb`,
      sha256,
      sizeBytes: glb.length,
      license: "generated",
      metadata: { generator: opts.factory, seed: opts.seed, sourceSha256: createHash("sha256").update(source).digest("hex"), meshCount: meshes.length }
    };
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    const fullReport = { id: opts.name, factory: opts.factory, seed: opts.seed, meshCount: meshes.length, bytes: glb.length, ...report };
    writeFileSync(join(outDir, `${opts.name}.report.json`), JSON.stringify(fullReport, null, 2));
    mkdirSync(join(cwd, "src", "bridge"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "bridge", "assets.ts"),
      `// Generated by the bridge (do not edit): typed Aura3D model assets made from the three.js factories in this folder.\nimport { defineModelAssets } from "@aura3d/engine";\n\nexport const bridgeAssets = defineModelAssets(${JSON.stringify(manifest, null, 2)} as const, { queryParam: null });\n\nexport const bridgeMeshCounts: Record<string, number> = ${JSON.stringify(Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.metadata.meshCount])))};\n`
    );
    result = { ok: true, ...fullReport, url: manifest[opts.name].url, module: "src/bridge/assets.ts", usage: `import { bridgeAssets } from "./bridge/assets"; scene.add(bridgeAssets.node("${opts.name}", { name: "${opts.name}", scaleMode: "world" }))` };
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
  process.stdout.write(opts.json ? JSON.stringify(result) : `${result.id}: ${result.meshCount} meshes, ${result.bytes} bytes\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`bridge failed: ${error.message}\n`);
    process.exit(1);
  });
}
