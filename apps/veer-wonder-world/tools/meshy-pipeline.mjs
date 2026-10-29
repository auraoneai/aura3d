// Wonder World asset pipeline: Meshy (through Kiro Prism) text -> preview -> refine -> remesh [-> rig -> animate].
// Resumable: per-asset state in <art>/<key>/state.json. Raw downloads stay outside the repo.
// Usage (from apps/veer-wonder-world): node tools/meshy-pipeline.mjs [--only key1,key2] [--concurrency 6]
// Raw downloads go to <repo>/artifacts/meshy/wonder-world (gitignored); admit optimized copies into public/aura-assets.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..", "..");
const ART = process.env.WONDER_ART ?? join(REPO, "artifacts", "meshy", "wonder-world");
const AURA = process.env.AURA3D_BIN ?? "aura3d";
const spec = JSON.parse(readFileSync(join(here, "wonder-assets.json"), "utf8"));
const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const CONC = args.includes("--concurrency") ? Number(args[args.indexOf("--concurrency") + 1]) : 6;
const RIG_ACTIONS = {
  momo: { idle: 0, wave: 290, talk: 313, happyJump: 44, cheer: 298, sway: 415, mirror: 48, pickUp: 276, lookAround: 333, sleep: 267, drink: 342, wakeUp: 271, jazzHands: 408, shrug: 317 },
  lulu: { idle: 0, dance: 405, hop: 417, cheer: 298, wave: 290, talk: 313, sway: 415, jazzHands: 408, happyJump: 44, funnyDance: 22 }
};

const env = {
  ...process.env,
  MESHY_API_KEY: process.env.PRISM_API_KEY,
  MESHY_BASE_URL_V1: "https://prism.auraone.ai/v1/meshy/openapi/v1",
  MESHY_BASE_URL_V2: "https://prism.auraone.ai/v1/meshy/openapi/v2",
  NO_UPDATE_NOTIFIER: "1"
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (key, msg) => console.log(`${new Date().toISOString()} [${key}] ${msg}`);

function run(cmd, argv) {
  return new Promise((resolve) => {
    const p = spawn(cmd, argv, { env });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };

async function ledger(op, phase, extra = []) {
  if (phase === "reserve") {
    const r = await run(AURA, ["meshy", "ledger", "reserve", "--game", "wonder-world", "--op", op]);
    return r.out.trim().split(/\s+/).pop();
  }
  await run(AURA, ["meshy", "ledger", "settle", ...extra]);
  return null;
}

// Create a task, retrying when Prism's pool hits a key that Meshy refuses.
async function create(key, resource, op, argv) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const rid = await ledger(op, "reserve");
    const r = await run("meshy", [resource, "create", ...argv, "--async"]);
    const res = json(r.out);
    if (r.code === 0 && res?.task_id) {
      await ledger(op, "settle", ["--rid", rid, "--exit-code", "0", "--task-id", res.task_id]);
      return res.task_id;
    }
    await ledger(op, "settle", ["--rid", rid, "--status", "failed", "--error-text", (r.err || r.out).slice(0, 300)]);
    const transient = /quota_exhausted|rate|429|503|upstream|timeout/i.test(r.err + r.out);
    log(key, `${resource} create failed (attempt ${attempt}): ${(res?.message ?? r.err).slice(0, 160)}`);
    if (!transient) throw new Error(`${resource} create failed: ${r.err.slice(0, 300)}`);
    await sleep(15000 * attempt);
  }
  throw new Error(`${resource} create kept failing`);
}

async function wait(key, resource, id) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const r = await run("meshy", [resource, "wait", id, "--timeout", "1500"]);
    const res = json(r.out);
    if (res?.status === "SUCCEEDED") return res;
    if (res?.status === "FAILED" || res?.status === "CANCELED") throw new Error(`${resource} ${id} ${res.status}: ${JSON.stringify(res.task_error ?? {})}`);
    log(key, `wait ${resource} ${id} not done (${res?.status ?? r.err.slice(0, 120)}), retry ${attempt}`);
    await sleep(20000);
  }
  throw new Error(`${resource} ${id} never finished`);
}

function glbUrls(obj, prefix = "", acc = []) {
  if (!obj || typeof obj !== "object") return acc;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && /^https:\/\/.+\.glb(\?|$)/.test(v)) acc.push([prefix + k, v]);
    else if (typeof v === "object") glbUrls(v, `${prefix}${k}.`, acc);
  }
  return acc;
}
async function download(url, file) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) { writeFileSync(file, Buffer.from(await res.arrayBuffer())); return; }
    await sleep(5000 * attempt);
  }
  throw new Error(`download failed ${file}`);
}

async function processAsset(a) {
  const dir = join(ART, a.key);
  mkdirSync(dir, { recursive: true });
  const statePath = join(dir, "state.json");
  const style = a.face ? spec.characterStyle : spec.propStyle;
  const st = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { key: a.key, prompt: `${a.prompt}, ${style}`, steps: {} };
  const save = () => writeFileSync(statePath, JSON.stringify(st, null, 2));
  const step = async (name, resource, op, argv, after) => {
    if (st.steps[name]?.done) return st.steps[name];
    st.steps[name] = st.steps[name] ?? {};
    if (!st.steps[name].taskId) { st.steps[name].taskId = await create(a.key, resource, op, argv()); save(); }
    const res = await wait(a.key, resource, st.steps[name].taskId);
    st.steps[name].result = { id: res.id, type: res.type, finished_at: res.finished_at };
    if (after) await after(res, st.steps[name]);
    st.steps[name].done = true; save();
    log(a.key, `${name} done (${st.steps[name].taskId})`);
    return st.steps[name];
  };

  await step("preview", "text-to-3d", "preview", () => ["--mode", "preview", "--prompt", st.prompt.slice(0, 600), ...(a.rig ? ["--pose-mode", "a-pose"] : [])]);
  await step("refine", "text-to-3d", "refine", () => ["--mode", "refine", "--preview-task-id", st.steps.preview.taskId, "--texture-resolution", "2k", "--texture-prompt", `${a.prompt}, ${style}`.slice(0, 600)], async (res) => {
    if (res.thumbnail_url) await download(res.thumbnail_url, join(dir, "thumb.png"));
  });
  await step("remesh", "remesh", "remesh", () => ["--input-task-id", st.steps.refine.taskId, "--target-polycount", String(a.poly ?? 6000)], async (res) => {
    const urls = glbUrls(res);
    if (!urls.length) throw new Error("remesh has no glb url");
    await download(urls[0][1], join(dir, "model.glb"));
  });
  if (a.rig) {
    await step("rig", "rigging", "rigging", () => ["--input-task-id", st.steps.remesh.taskId, "--height-meters", String(a.height ?? 1)], async (res, s) => {
      s.files = [];
      for (const [name, url] of glbUrls(res)) { const f = `rig.${name.replace(/[^a-z0-9]+/gi, "_")}.glb`; await download(url, join(dir, f)); s.files.push(f); }
    });
    for (const [clip, actionId] of Object.entries(RIG_ACTIONS[a.key] ?? {})) {
      await step(`anim_${clip}`, "animate", "animate", () => ["--rig-task-id", st.steps.rig.taskId, "--action-id", String(actionId)], async (res, s) => {
        const urls = glbUrls(res);
        if (!urls.length) throw new Error(`animate ${clip} has no glb`);
        s.actionId = actionId;
        await download(urls[0][1], join(dir, `anim.${clip}.glb`));
      });
    }
  }
  writeFileSync(join(dir, "rights.json"), JSON.stringify({
    schema: "aura3d.meshy-rights/1",
    asset: a.key,
    basis: "Generated by the AuraOne Meshy API accounts through Kiro Prism under the Meshy plan terms in force at generation time. Original text prompt written for this project; no third-party character, brand or image input.",
    generatedAt: new Date().toISOString(),
    prompt: st.prompt,
    taskIds: Object.fromEntries(Object.entries(st.steps).map(([k, v]) => [k, v.taskId])),
    exclusivity: "not claimed",
    license: "Meshy generated output (account plan terms); not CC0"
  }, null, 2));
  st.complete = true; save();
  log(a.key, "COMPLETE");
}

if (args.includes("--thumbs")) {
  for (const a of spec.assets) {
    const sp = join(ART, a.key, "state.json");
    if (!existsSync(sp)) continue;
    const st = JSON.parse(readFileSync(sp, "utf8"));
    const id = st.steps?.refine?.done ? st.steps.refine.taskId : null;
    if (!id || existsSync(join(ART, a.key, "thumb.png"))) continue;
    const r = await run("meshy", ["text-to-3d", "get", id]);
    const res = json(r.out);
    if (res?.thumbnail_url) { await download(res.thumbnail_url, join(ART, a.key, "thumb.png")); log(a.key, "thumb"); }
  }
  process.exit(0);
}
// `procedural: true` assets are drawn from scene geometry by design and are never generated.
const queue = spec.assets.filter((a) => !a.procedural && (!only || only.has(a.key)));
const failures = [];
let next = 0;
await Promise.all(Array.from({ length: CONC }, async (_, w) => {
  await sleep(w * 4000);
  while (next < queue.length) {
    const a = queue[next++];
    try { await processAsset(a); } catch (e) { failures.push([a.key, String(e.message ?? e)]); log(a.key, `FAILED ${e.message ?? e}`); }
  }
}));
console.log(`DONE ok=${queue.length - failures.length} failed=${failures.length}`);
for (const [k, m] of failures) console.log(`FAIL ${k}: ${m}`);
