#!/usr/bin/env node
// Admits Meshy-generated models into the app. Per approved key in tools/model-review.json:
//   rigged (Momo, Lulu): aura3d assets merge-clips (walk, run and every Meshy library clip) -> merged.glb
//   aura3d assets optimize (role budget, texture size), apply the review recolor (sharp hue/saturation shift of the
//   base colour texture) or tint (glTF baseColorFactor, sRGB hex -> linear)
//   for washed-out generations, then strip normal/metallic-roughness maps on
//   everything except the main cast (matte clay look; keeps the art budget near the PRD's ~25 MB) and store the main
//   cast's PNG normal maps as JPEG (tools/jpeg-normal-maps.mjs),
//   stamp asset.extras.aura3d.orientation (Meshy exports face +z), inspect, validate --skin (rigged),
//   copy to src/assets/models/<key>.<sha8>.glb and write provenance/models/<key>.json.
// Finally regenerates src/aura-assets.ts.
//
//   node tools/admit-models.mjs [--only key1,key2] [--force]
//
// Raw Meshy output stays in <repo>/artifacts/meshy/wonder-world (gitignored); run from any directory.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { jpegNormalMaps, NORMAL_MAP_JPEG } from "./jpeg-normal-maps.mjs";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "..", "..");
const art = join(repo, "artifacts", "meshy", "wonder-world");
const AURA = process.env.AURA3D_BIN ?? join(app, "node_modules", ".bin", "aura3d");
const spec = JSON.parse(readFileSync(join(app, "tools", "wonder-assets.json"), "utf8"));
const review = JSON.parse(readFileSync(join(app, "tools", "model-review.json"), "utf8"));
const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const force = args.includes("--force");
const MAIN_CAST = new Set(["momo", "lulu", "sheru", "gogo", "lumi", "peeko"]);
const modelsDir = join(app, "src", "assets", "models");
const provDir = join(app, "provenance", "models");
mkdirSync(modelsDir, { recursive: true });
mkdirSync(provDir, { recursive: true });

const aura = (argv) => execFileSync(AURA, argv, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
// gltf-transform logs ("prune: Removed ...") share stdout with the JSON report: parse from the first line that opens an object.
const parseReport = (text) => {
  const lines = String(text ?? "").split("\n");
  const start = lines.findIndex((l) => l.startsWith("{"));
  return start < 0 ? null : JSON.parse(lines.slice(start).join("\n"));
};
const auraJson = (argv) => {
  let out;
  try { out = aura(argv); } catch (error) {
    const report = (() => { try { return parseReport(error.stdout); } catch { return null; } })();
    if (report) return report;
    throw new Error(`aura3d ${argv[0]} ${argv[1]} failed: ${String(error.stderr ?? error.message).slice(0, 600)}`);
  }
  const report = parseReport(out);
  if (!report) throw new Error(`aura3d ${argv[0]} ${argv[1]} printed no JSON report`);
  return report;
};
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
// Load core, extensions and functions from the repo root so prune()'s instanceof checks see one copy of core.
const rootRequire = createRequire(join(repo, "package.json"));
const { NodeIO } = rootRequire("@gltf-transform/core");
const { ALL_EXTENSIONS } = rootRequire("@gltf-transform/extensions");
const { prune } = rootRequire("@gltf-transform/functions");
const sharp = rootRequire("sharp");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function rigInputs(dir) {
  const base = join(dir, "rig.result_rigged_character_glb_url.glb");
  if (!existsSync(base)) throw new Error("rigged character glb missing");
  const clips = [];
  const walk = join(dir, "rig.result_basic_animations_walking_glb_url.glb");
  const run = join(dir, "rig.result_basic_animations_running_glb_url.glb");
  if (existsSync(walk)) clips.push(["walk", walk]);
  if (existsSync(run)) clips.push(["run", run]);
  for (const f of readdirSync(dir).filter((x) => /^anim\..+\.glb$/.test(x)).sort()) clips.push([f.slice(5, -4), join(dir, f)]);
  return { base, clips };
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function tintFactor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Number(srgbToLinear(v / 255).toFixed(4))).concat(1);
}

async function finish(input, output, key, tint, recolor) {
  const doc = await io.read(input);
  const root = doc.getRoot();
  let stripped = false;
  if (recolor) {
    const done = new Set();
    for (const material of root.listMaterials()) {
      const texture = material.getBaseColorTexture();
      if (!texture || done.has(texture)) continue;
      done.add(texture);
      const shifted = await sharp(Buffer.from(texture.getImage())).modulate({ hue: recolor.hue ?? 0, saturation: recolor.saturation ?? 1, brightness: recolor.brightness ?? 1 }).jpeg({ quality: 86 }).toBuffer();
      texture.setImage(new Uint8Array(shifted)).setMimeType("image/jpeg");
    }
  }
  const factor = tintFactor(tint);
  if (factor) for (const material of root.listMaterials()) material.setBaseColorFactor(factor);
  if (!MAIN_CAST.has(key)) {
    for (const material of root.listMaterials()) {
      if (material.getNormalTexture() || material.getMetallicRoughnessTexture() || material.getOcclusionTexture()) stripped = true;
      material.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
      material.setMetallicFactor(0).setRoughnessFactor(0.85);
    }
    await doc.transform(prune());
  }
  const normalMaps = MAIN_CAST.has(key) ? await jpegNormalMaps(doc, sharp) : [];
  const asset = root.getAsset();
  asset.extras = { ...(asset.extras ?? {}), aura3d: { orientation: { forwardAxis: "+z", upAxis: "+y", source: "Meshy export convention (faces +z)" } } };
  await io.write(output, doc);
  return { stripped, normalMaps };
}

const admitted = [];
const skipped = [];
for (const a of spec.assets) {
  if (only && !only.has(a.key)) continue;
  const r = review[a.key];
  if (!r || r.status !== "approved") { skipped.push(`${a.key} (review: ${r?.status ?? "none"})`); continue; }
  const dir = join(art, a.key);
  const state = existsSync(join(dir, "state.json")) ? JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) : null;
  const fromRefine = r.source === "refine";
  if (!state?.complete && !(fromRefine && existsSync(join(dir, "refine.glb")))) { skipped.push(`${a.key} (generation incomplete)`); continue; }
  const provPath = join(provDir, `${a.key}.json`);
  if (!force && existsSync(provPath)) { skipped.push(`${a.key} (already admitted; --force to redo)`); continue; }
  const work = join(dir, "admit");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  let source = join(dir, fromRefine ? "refine.glb" : "model.glb");
  let merge = null;
  let clips = [];
  if (a.rig) {
    const { base, clips: inputs } = rigInputs(dir);
    const merged = join(work, "merged.glb");
    const res = auraJson(["assets", "merge-clips", "--base", base, "--out", merged, ...inputs.map(([n, f]) => `${n}=${f}`), "--json"]);
    merge = { base: relative(repo, base), clips: inputs.map(([n, f]) => ({ name: n, file: relative(repo, f) })), result: res };
    source = merged;
  }
  const role = a.rig || MAIN_CAST.has(a.key) || a.face ? "character" : a.role === "background" ? "background" : a.role === "vehicle" ? "vehicle" : "prop";
  const tex = MAIN_CAST.has(a.key) ? 1024 : 512;
  const optimized = join(work, "optimized.glb");
  const opt = auraJson(["assets", "optimize", "--file", source, "--out", optimized, "--role", role, "--tex", String(tex), ...(a.rig ? ["--no-simplify"] : []), ...(fromRefine ? ["--max-verts", String(Math.round((a.poly ?? 6000) * 0.7))] : []), "--json"]);
  const finalPath = join(work, "final.glb");
  const { stripped, normalMaps } = await finish(optimized, finalPath, a.key, r.tint, r.recolor);
  const inspection = auraJson(["assets", "inspect", finalPath, "--animation", "--skeleton", "--morphs"]);
  clips = (inspection.animations ?? []).filter((n) => typeof n === "string");
  let skin = null;
  if (a.rig) {
    try { skin = auraJson(["assets", "validate", "--skin", finalPath, "--json"]); }
    catch (error) { skin = { ok: false, error: String(error.message).slice(0, 600) }; }
  }
  const digest = sha256(finalPath);
  for (const f of readdirSync(modelsDir).filter((x) => x.startsWith(`${a.key}.`) && x.endsWith(".glb"))) rmSync(join(modelsDir, f));
  const file = `${a.key}.${digest.slice(0, 8)}.glb`;
  writeFileSync(join(modelsDir, file), readFileSync(finalPath));
  const rights = existsSync(join(dir, "rights.json")) ? JSON.parse(readFileSync(join(dir, "rights.json"), "utf8")) : null;
  writeFileSync(provPath, JSON.stringify({
    schema: "wonder-world.model-provenance/1",
    key: a.key,
    file: `src/assets/models/${file}`,
    sha256: digest,
    sizeBytes: statSync(join(modelsDir, file)).size,
    rigged: Boolean(a.rig),
    clips,
    heightM: a.heightM,
    role,
    license: "Meshy-generated output under the AuraOne account plan terms at generation time; original text prompt; not CC0; exclusivity not claimed",
    source: { generator: "Meshy text-to-3d (preview, refine 2k, remesh) via Kiro Prism", prompt: state.prompt, taskIds: Object.fromEntries(Object.entries(state.steps).map(([k, v]) => [k, v.taskId])), rights },
    processing: {
      merge,
      optimize: { role: opt.role, tex: opt.tex, maxVerts: opt.maxVerts, simplify: opt.simplify, simplified: opt.simplified, vertsBefore: opt.vertsBefore, vertsAfter: opt.vertsAfter, bytesIn: opt.bytesIn, bytesOut: opt.bytesOut },
      strippedNormalAndRoughnessMaps: stripped,
      normalMapJpeg: normalMaps.length > 0 ? { ...NORMAL_MAP_JPEG, encoder: "sharp", textures: normalMaps } : null,
      tint: r.tint ?? null,
      recolor: r.recolor ?? null,
      source: r.source === "refine" ? "refine model simplified locally (the remesh task could not run: its pinned Meshy key returned 402)" : "remesh",
      orientation: { forwardAxis: "+z", upAxis: "+y" }
    },
    inspection: { vertexCount: inspection.vertexCount, bounds: inspection.bounds, textures: inspection.textures, animations: inspection.animations, skeleton: inspection.skeleton ? { skinCount: inspection.skeleton.skinCount, jointCount: inspection.skeleton.jointCount } : null, warnings: inspection.warnings },
    skin,
    review: r,
    admittedAt: "2026-10-29"
  }, null, 2));
  admitted.push(`${a.key} ${file} ${(statSync(join(modelsDir, file)).size / 1024).toFixed(0)} KB${clips.length ? ` clips=${clips.join(",")}` : ""}`);
  console.log(`admitted ${admitted[admitted.length - 1]}`);
}
execFileSync(process.execPath, [join(app, "tools", "gen-aura-assets.mjs")], { stdio: "inherit" });
const total = readdirSync(modelsDir).filter((f) => f.endsWith(".glb")).reduce((s, f) => s + statSync(join(modelsDir, f)).size, 0);
console.log(`admitted ${admitted.length}, skipped ${skipped.length}; models on disk ${(total / 1024 / 1024).toFixed(1)} MB`);
for (const s of skipped) console.log(`  skipped ${s}`);
