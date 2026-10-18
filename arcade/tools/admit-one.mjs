// admit-one.mjs — shrink, (rebuild if over ceiling), stage, and report one Meshy asset.
// usage: node admit-one.mjs <game> <asset> <name> <prompt> [generatedAt]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [game, asset, name, prompt, generatedAt = "2026-10-18"] = process.argv.slice(2);
const root = `/Users/gurbakshchahal/platforms/aura3d/artifacts/meshy/${game}/${asset}`;
const adm = `${root}/admitted`;

function run(cmd, env = {}, cwd = "/Users/gurbakshchahal/platforms/aura3d") {
  execFileSync(cmd[0], cmd.slice(1), { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
}

run(["node", "arcade/tools/shrink-glb.mjs", `${root}/model.glb`, `${adm}/model.glb`], { NODE_OPTIONS: "--max-old-space-size=4096" });

let report = JSON.parse(readFileSync(`${adm}/model.glb.report.json`, "utf8"));
if (!report.withinVertexCeiling) {
  console.log(`over vertex ceiling (${report.verts.after}); applying position-keyed rebuild`);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(`${adm}/model.glb`);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const arr = pos.getArray();
      const n = pos.getCount();
      const Q = 1e-5;
      const firstIdx = new Map();
      const remap = new Uint32Array(n);
      const order = [];
      for (let i = 0; i < n; i++) {
        const k = Math.round(arr[i * 3] / Q) + "|" + Math.round(arr[i * 3 + 1] / Q) + "|" + Math.round(arr[i * 3 + 2] / Q);
        if (firstIdx.has(k)) remap[i] = firstIdx.get(k);
        else { firstIdx.set(k, order.length); remap[i] = order.length; order.push(i); }
      }
      const idxArr = prim.getIndices().getArray();
      const newIdx = [];
      for (let t = 0; t < idxArr.length; t += 3) {
        const a = remap[idxArr[t]], b = remap[idxArr[t + 1]], c = remap[idxArr[t + 2]];
        if (a !== b && b !== c && a !== c) newIdx.push(a, b, c);
      }
      const m = order.length;
      const build = (semantic, size) => {
        const acc = prim.getAttribute(semantic);
        if (!acc) return null;
        const src = acc.getArray();
        const out = new Float32Array(m * size);
        for (let j = 0; j < m; j++) for (let d = 0; d < size; d++) out[j * size + d] = src[order[j] * size + d];
        return doc.createAccessor(semantic).setArray(out).setType(size === 2 ? "VEC2" : "VEC3");
      };
      prim.setAttribute("POSITION", build("POSITION", 3));
      const nn = build("NORMAL", 3); if (nn) prim.setAttribute("NORMAL", nn);
      const uv = build("TEXCOORD_0", 2); if (uv) prim.setAttribute("TEXCOORD_0", uv);
      prim.setIndices(doc.createAccessor("indices").setArray(new Uint32Array(newIdx)).setType("SCALAR"));
      console.log(`  rebuilt ${n} -> ${m} verts, tris -> ${newIdx.length / 3}`);
    }
  }
  await io.write(`${adm}/model.glb`, doc);
  run(["node", "arcade/tools/shrink-glb.mjs", `${adm}/model.glb`, `${adm}/model.glb`], { NODE_OPTIONS: "--max-old-space-size=4096" });
  report = JSON.parse(readFileSync(`${adm}/model.glb.report.json`, "utf8"));
}

if (!report.withinVertexCeiling || !report.withinSizeCeiling) {
  console.error(`ADMIT FAILED ${game}/${asset}: ${report.verts.after}v ${report.bytes.mbAfter}MB`);
  process.exit(1);
}

copyFileSync(`${root}/meta.json`, `${adm}/meta.json`);
copyFileSync(`${root}/thumbnail.png`, `${adm}/thumbnail.png`);
const meta = JSON.parse(readFileSync(`${adm}/meta.json`, "utf8"));
const taskId = meta.id || meta.task_id || meta.taskId || (meta.task && (meta.task.id || meta.task.task_id)) || (meta.data && (meta.data.id || meta.data.task_id));
const rights = {
  schema: "aura3d.meshy-rights/1.0",
  provider: "meshy",
  providerResource: "text-to-3d",
  taskId,
  prompt,
  generatedAt,
  rightsBasis: "Generated with Meshy text-to-3D on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
  termsUrl: "https://www.meshy.ai/terms",
  quality: "candidate"
};
writeFileSync(`${adm}/rights.json`, JSON.stringify(rights, null, 2) + "\n");
console.log(`STAGED ${name}: ${report.verts.after}v ${report.bytes.mbAfter}MB taskId ${taskId}`);

const appDir = `/Users/gurbakshchahal/platforms/aura3d/arcade/${game}`;
run(["node", "../../node_modules/@aura3d/cli/dist/cli.js", "assets", "import-meshy", `${adm}`, "--name", name, "--rights-evidence", `${adm}/rights.json`, "--profile", "prop", "--role", "prop", "--allowed-root", "/Users/gurbakshchahal/platforms/aura3d/artifacts/meshy", "--quality", "candidate"], {}, appDir);
console.log(`IMPORTED ${name}`);
