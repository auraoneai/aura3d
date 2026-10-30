#!/usr/bin/env node
// GU47 WP-36 resumable Meshy asset pipeline (lane wp36). A copy lives in docs/prds/game-upgrades-47/lanes/wp36-pipeline.mjs.
//
// Reads docs/prds/game-upgrades-47/lanes/wp36-plan.json and, per row: ledger reserve -> Meshy submit (through Kiro Prism)
// -> poll -> download to artifacts/gu47-meshy/<slug>/<key>/ (never overwrites) -> ledger settle -> rights.json ->
// `aura3d assets optimize` -> (rigs/clips) `assets merge-clips` + `validate-animation --require-rig` -> isolated
// `assets import-meshy --into artifacts/gu47-meshy/<slug>/_admit`. Retextures also record a geometry hash before/after.
// State per row: artifacts/gu47-meshy/_state/rows/<key>.json, so a restart skips finished work and resumes started tasks.
//
//   node wp36-pipeline.mjs run [--priority P1,P2,P3] [--keys a,b] [--games slug,..] [--limit N]
//                              [--concurrency 6] [--max-concurrency 12] [--retry-failed] [--dry-run]
//   node wp36-pipeline.mjs status            # counts per status / priority, active and recent errors
//   node wp36-pipeline.mjs --catalogue       # writes docs/prds/game-upgrades-47/lanes/wp36-catalogue.md
//   node wp36-pipeline.mjs ledger-md         # writes evidence/game-upgrades-47/meshy-ledger.md (reads the Prism pool)
//
// Secrets: PRISM_API_KEY comes from the environment and is passed to the meshy CLI only as MESHY_API_KEY in the child
// environment (base URLs point at Prism). It is never printed, logged or written. Exit 9 or a Prism refusal stops new
// paid work; tasks already submitted are still polled, downloaded and settled.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
function findRoot(start) {
  for (let d = start; d !== dirname(d); d = dirname(d)) {
    if (existsSync(join(d, "pnpm-workspace.yaml")) && existsSync(join(d, "packages/aura3d-cli/package.json"))) return d;
  }
  throw new Error("Aura3D repo root not found above " + start);
}
const ROOT = findRoot(process.env.WP36_ROOT ? resolve(process.env.WP36_ROOT) : HERE);
const BASE = join(ROOT, "artifacts/gu47-meshy");
const STATE = join(BASE, "_state");
const ROWS = join(STATE, "rows");
const PLAN = join(ROOT, "docs/prds/game-upgrades-47/lanes/wp36-plan.json");
const CATALOGUE = join(ROOT, "docs/prds/game-upgrades-47/lanes/wp36-catalogue.md");
const LEDGER_MD = join(ROOT, "evidence/game-upgrades-47/meshy-ledger.md");
const GEOMETRY_HASH = join(ROOT, "packages/aura3d-cli/skills/aura3d-retexture/references/geometry-hash.mjs");
const TSX = join(ROOT, "node_modules/.bin/tsx");
const PRISM = (process.env.AURA3D_PRISM_URL ?? "https://prism.auraone.ai").replace(/\/+$/, "");
const MESHY_BIN = process.env.MESHY_BIN ?? "meshy";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);
const BANNED = /goku|saiyan/i;

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);
const list = (name) => (opt(name) ? opt(name).split(",").map((s) => s.trim()).filter(Boolean) : undefined);

const plan = JSON.parse(readFileSync(PLAN, "utf8"));
const rows = plan.rows;
const byKey = new Map(rows.map((r) => [r.key, r]));
const tagOf = (row) => `gu47-${row.slug}`;
// plan sources are repo-relative, or absolute (read-only files in the main checkout's artifacts)
const sourcePath = (p) => (isAbsolute(p) ? p : join(ROOT, p));
const rowDir = (row) => join(BASE, row.slug, row.key);

// ---------- small utils ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = () => new Date().toISOString();
const hhmmss = () => new Date().toTimeString().slice(0, 8);
function scrub(text) {
  let t = String(text ?? "");
  for (const k of [process.env.PRISM_API_KEY, process.env.AURA3D_PRISM_KEY, process.env.MESHY_API_KEY]) if (k) t = t.split(k).join("<redacted>");
  return t.replace(/msy_[A-Za-z0-9_-]+/g, "msy_<redacted>").replace(/(https?:\/\/[^\s"'?]+)\?[^\s"']*/g, "$1?<signed>");
}
const short = (s, n = 160) => scrub(s).replace(/\s+/g, " ").trim().slice(0, n);
const log = (key, msg) => console.log(`${hhmmss()} ${key} ${short(msg, 220)}`);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
function parseJson(text) {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { /* fall through */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch { /* ignore */ } }
  return undefined;
}

function run(cmd, args, { env = process.env, cwd = ROOT, timeoutMs = 0 } = {}) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; if (stdout.length > 40e6) stdout = stdout.slice(-20e6); });
    child.stderr.on("data", (d) => { stderr += d; if (stderr.length > 2e6) stderr = stderr.slice(-1e6); });
    const timer = timeoutMs ? setTimeout(() => child.kill("SIGTERM"), timeoutMs) : undefined;
    child.on("error", (e) => { clearTimeout(timer); done({ code: 127, stdout, stderr: stderr + String(e) }); });
    child.on("close", (code, signal) => { clearTimeout(timer); done({ code: code ?? (signal ? 143 : 1), stdout, stderr }); });
  });
}

function semaphore(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active += 1;
    const { fn, ok, fail } = queue.shift();
    fn().then(ok, fail).finally(() => { active -= 1; next(); });
  };
  return (fn) => new Promise((ok, fail) => { queue.push({ fn, ok, fail }); next(); });
}
const heavy = semaphore(Number(opt("--heavy", "2")));

function meshyEnv() {
  const key = process.env.PRISM_API_KEY;
  if (!key) throw new Error("PRISM_API_KEY is not set in the environment");
  return {
    ...process.env,
    MESHY_API_KEY: key,
    MESHY_BASE_URL_V1: `${PRISM}/v1/meshy/openapi/v1`,
    MESHY_BASE_URL_V2: `${PRISM}/v1/meshy/openapi/v2`,
    MESHY_CLI_NO_UPDATE_NOTIFIER: "1",
    MESHY_CLI_NO_BROWSER: "1",
    MESHY_LOG_LEVEL: "warn",
    MESHY_POLL_INTERVAL_MS: process.env.MESHY_POLL_INTERVAL_MS ?? "15000"
  };
}
async function meshy(args, { timeoutMs = 0 } = {}) {
  const r = await run(MESHY_BIN, args, { env: meshyEnv(), timeoutMs });
  const json = parseJson(r.stdout);
  return { code: r.code, json, err: scrub(`${r.stderr} ${json?.message ?? ""}`).trim() };
}
function aura(args, timeoutMs = 30 * 60e3) {
  return heavy(() => run(TSX, ["--tsconfig", "tsconfig.base.json", "packages/aura3d-cli/src/cli.ts", ...args], { env: { ...process.env, NODE_NO_WARNINGS: "1" }, timeoutMs }));
}

let LEDGER;
async function ledger() {
  if (!LEDGER) {
    const { tsImport } = await import("tsx/esm/api");
    LEDGER = await tsImport(pathToFileURL(join(ROOT, "packages/aura3d-cli/src/commands/meshyLedger.ts")).href, import.meta.url);
  }
  return LEDGER;
}
async function reserve(row, op) {
  return (await ledger()).reserveMeshyCredits({ game: tagOf(row), op });
}
async function settle(rid, input) {
  if (!rid) return;
  try { (await ledger()).settleMeshyCredits(rid, input); } catch (e) { log("ledger", `settle ${rid} ${input.status}: ${e.message}`); }
}
async function poolRaw() {
  const key = process.env.AURA3D_PRISM_KEY ?? process.env.PRISM_API_KEY;
  if (!key) throw new Error("PRISM_API_KEY is not set");
  const res = await fetch(`${PRISM}/admin/meshy`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Prism /admin/meshy HTTP ${res.status}`);
  return res.json();
}
async function poolSnapshot(label) {
  try {
    const raw = await poolRaw();
    writeFileSync(join(STATE, "pool-latest.json"), JSON.stringify({ at: iso(), label, ...raw }, null, 1));
    return raw;
  } catch (e) {
    log("pool", `read failed: ${e.message}`);
    return undefined;
  }
}

// ---------- state ----------
const states = new Map();
function loadState(key) {
  if (states.has(key)) return states.get(key);
  let st;
  try { st = JSON.parse(readFileSync(join(ROWS, `${key}.json`), "utf8")); } catch { st = undefined; }
  if (st) states.set(key, st);
  return st;
}
function stateFor(row) {
  let st = loadState(row.key);
  if (!st) {
    st = { key: row.key, slug: row.slug, op: row.op, priority: row.priority, status: "pending", tasks: {}, attempts: 0, history: [] };
    states.set(row.key, st);
  }
  st.tasks ??= {};
  st.history ??= [];
  return st;
}
function saveState(st) {
  st.updatedAt = iso();
  mkdirSync(ROWS, { recursive: true });
  const file = join(ROWS, `${st.key}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(st, null, 1));
  renameSync(`${file}.tmp`, file);
}

// ---------- GLB summary (tris, textures, bounds, clips) ----------
function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  let offset = 12;
  let json;
  let bin;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  return { json, bin, bytes: buf.length };
}
function imageSize(b) {
  if (!b || b.length < 24) return undefined;
  if (b[0] === 0x89 && b[1] === 0x50) return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o += 1; continue; }
      const m = b[o + 1];
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return `${b.readUInt16BE(o + 7)}x${b.readUInt16BE(o + 5)}`;
      o += 2 + b.readUInt16BE(o + 2);
    }
  }
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 12, 16) === "VP8X") return `${1 + b.readUIntLE(24, 3)}x${1 + b.readUIntLE(27, 3)}`;
  return undefined;
}
function summarize(path) {
  const { json, bin, bytes } = readGlb(path);
  const acc = json.accessors ?? [];
  let tris = 0;
  let verts = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const nodes = json.nodes ?? [];
  const meshNodes = nodes.filter((n) => n.mesh !== undefined);
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      const pos = acc[p.attributes?.POSITION];
      if (pos) {
        verts += pos.count;
        if (pos.min && pos.max) for (let i = 0; i < 3; i += 1) { min[i] = Math.min(min[i], pos.min[i]); max[i] = Math.max(max[i], pos.max[i]); }
      }
      if ((p.mode ?? 4) === 4) tris += p.indices !== undefined ? acc[p.indices].count / 3 : (pos?.count ?? 0) / 3;
    }
  }
  const images = (json.images ?? []).map((img) => {
    let b;
    if (img.bufferView !== undefined && bin) {
      const v = json.bufferViews[img.bufferView];
      b = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    }
    return `${(img.mimeType ?? "?").replace("image/", "")}:${imageSize(b) ?? "?"}`;
  });
  return {
    kb: Math.round(bytes / 1024),
    tris: Math.round(tris),
    verts,
    materials: (json.materials ?? []).length,
    images,
    skins: (json.skins ?? []).length,
    joints: (json.skins ?? []).reduce((n, s) => n + (s.joints?.length ?? 0), 0),
    anims: (json.animations ?? []).map((a) => a.name ?? "?"),
    // local POSITION bounds (node scale from optimize is noted separately)
    bounds: Number.isFinite(min[0]) ? max.map((v, i) => Number((v - min[i]).toFixed(3))) : null,
    nodeScale: meshNodes.some((n) => n.scale) ? meshNodes.find((n) => n.scale).scale : undefined
  };
}

// ---------- errors ----------
class StepError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}
function classifyCreateFailure(code, err, pinned) {
  if (code === 9 || /\b402\b/.test(err)) return pinned ? "pinned-exhausted" : "credits";
  if (/quota_exhausted/.test(err)) return pinned ? "pinned-exhausted" : "credits";
  if (code === 3 || /all_keys_invalid|not_configured|\b401\b|\b403\b/.test(err)) return "auth";
  if (code === 6 || /\b429\b|rate_limited/.test(err)) return "rate";
  if (code === 4) return "invalid";
  if (code === 2) return "usage";
  return "transient";
}

// ---------- run-wide control ----------
let STOP_NEW = false; // no new unpinned paid calls (pool exhausted / exit 9)
let STOP_ALL = false; // no paid calls at all (auth refusal, signal)
let refusalStreak = 0; // consecutive Prism quota refusals on unpinned creates
async function poolHasCapacity(cost) {
  const raw = await poolSnapshot("refusal check");
  if (raw) poolMax = maxUsable(raw);
  return Boolean(raw && (raw.keys ?? []).some((k) => k.state === "ok" && k.remaining - (k.inflight ?? 0) >= cost));
}
// Largest balance on a usable key. Prism puts a new task on the fullest key and pins follow-ups (refine, rig, animate)
// to it, so a preview is only started while some key can also pay its refine (20 + 10), avoiding stranded previews.
let poolMax;
const maxUsable = (raw) => Math.max(0, ...(raw.keys ?? []).filter((k) => k.state === "ok").map((k) => k.remaining - (k.inflight ?? 0)));
const NEW_COST = { "text-to-3d": 30, retexture: 10, rig: 5 };
let concurrency = Number(opt("--concurrency", "6"));
const maxConcurrency = Math.min(12, Number(opt("--max-concurrency", "12")));
let last429 = 0;
let lastRaise = Date.now();
let pauseUntil = 0;
function onRateLimit(key) {
  last429 = Date.now();
  pauseUntil = Date.now() + 60_000;
  const next = Math.max(3, concurrency - 2);
  if (next !== concurrency) log(key ?? "-", `429: concurrency ${concurrency} -> ${next}`);
  concurrency = next;
}
function maybeRaise() {
  if (concurrency < maxConcurrency && Date.now() - last429 > 5 * 60e3 && Date.now() - lastRaise > 5 * 60e3) {
    concurrency += 1;
    lastRaise = Date.now();
    log("-", `concurrency -> ${concurrency}`);
  }
}

// ---------- Meshy task steps ----------
async function waitTask(row, resource, id) {
  let failures = 0;
  const started = Date.now();
  for (;;) {
    const r = await meshy([resource, "wait", id, "--timeout", "1200"]);
    const status = r.json?.status;
    if (TERMINAL.has(status)) return r.json;
    if (r.code === 8 || r.json?.timed_out) {
      if (Date.now() - started > 3 * 3600e3) throw new StepError("slow", `task ${id} still ${status ?? "?"} after 3h`);
      continue;
    }
    failures += 1;
    if (r.code === 6 || /\b429\b/.test(r.err)) onRateLimit(row.key);
    if (r.code === 5 && failures >= 3) throw new StepError("lost-task", `task ${id} not found through Prism: ${short(r.err)}`);
    if (failures > 30) throw new StepError("transient", `polling ${id} failed: ${short(r.err)}`);
    log(row.key, `poll retry ${failures} exit ${r.code} ${short(r.err, 120)}`);
    await sleep(Math.min(300_000, 20_000 * failures));
  }
}
async function getTask(row, resource, id) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const r = await meshy([resource, "get", id]);
    if (typeof r.json?.status === "string") return r.json;
    if (r.code === 6) onRateLimit(row.key);
    await sleep(10_000 * attempt);
  }
  throw new StepError("transient", `get ${id} failed`);
}

/** One paid Meshy call: reserve -> create --async -> wait -> settle. Resumes from the row state. */
async function paidTask(st, row, name, { resource, op, args, pinned }) {
  const L = await ledger();
  let t = (st.tasks[name] ??= {});
  if (t.status === "SUCCEEDED" && t.taskId) return { task: undefined, t };
  if (!t.taskId) {
    if (t.rid) {
      // reserved, but the submit outcome was never recorded (the process died in between): keep it counted
      await settle(t.rid, { status: "unconfirmed", note: "gu47 pipeline restart: submit outcome unknown" });
      st.history.push({ name, rid: t.rid, settled: "unconfirmed", note: "restart before task id was recorded", at: iso() });
      t = st.tasks[name] = {};
      saveState(st);
    }
    if (STOP_ALL || (STOP_NEW && !pinned)) throw new StepError("stopped", "no new paid calls (stop flag)");
    if (Date.now() < pauseUntil) await sleep(pauseUntil - Date.now());
    t.rid = await reserve(row, op);
    t.op = op;
    t.reservedAt = iso();
    saveState(st);
    const r = await meshy([resource, "create", ...args, "--async"], { timeoutMs: 15 * 60e3 });
    const id = r.json?.task_id;
    if (r.code === 0 && id) {
      refusalStreak = 0;
      t.taskId = id;
      t.submittedAt = iso();
      saveState(st);
      log(row.key, `${name} submitted ${id}`);
    } else {
      // Prism refusing before any key accepted the call (pool/key exhausted, no valid key) is a confirmed no-charge outcome.
      const refused = /quota_exhausted|all_keys_invalid|not_configured/.exec(r.err)?.[0];
      const outcome = refused ? { status: "failed", note: `Prism refused before a task existed: ${refused}` } : L.classifyMeshyOutcome({ exitCode: r.code, errorText: r.err });
      await settle(t.rid, outcome);
      st.history.push({ name, rid: t.rid, settled: outcome.status, exit: r.code, error: short(r.err, 300), at: iso() });
      st.tasks[name] = {};
      saveState(st);
      const kind = classifyCreateFailure(r.code, r.err, pinned);
      if (kind === "rate") onRateLimit(row.key);
      throw new StepError(kind, `${name} create exit ${r.code}: ${short(r.err)}`);
    }
  }
  const task = await waitTask(row, resource, t.taskId);
  t.status = task.status;
  t.finishedAt = iso();
  if (task.status === "SUCCEEDED") {
    const actual = num(task.consumed_credits) ?? num(task.credits) ?? L.MESHY_CREDIT_ESTIMATES[op];
    await settle(t.rid, { status: "ok", task_id: t.taskId, actual });
    t.settled = "ok";
    t.credits = actual;
    saveState(st);
    log(row.key, `${name} ok ${t.taskId}`);
    return { task, t };
  }
  const message = short(task.task_error?.message ?? task.status, 300);
  await settle(t.rid, { status: "failed", task_id: t.taskId, note: `task ${task.status}: ${message}`.slice(0, 300) });
  st.history.push({ name, ...t, settled: "failed", error: message });
  st.tasks[name] = {};
  st.attempts = (st.attempts ?? 0) + 1;
  saveState(st);
  throw new StepError("task-failed", `${name} ${task.status}: ${message}`);
}

/** Download a SUCCEEDED task's artifacts into <row>/<sub>; an existing non-empty directory is never overwritten. */
async function download(row, resource, taskId, sub) {
  const final = join(rowDir(row), sub);
  if (existsSync(final) && readdirSync(final).length > 0) return final;
  mkdirSync(dirname(final), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const tmp = `${final}.part-${process.pid}-${Date.now()}`;
    const r = await meshy([resource, "get", taskId, "-o", tmp], { timeoutMs: 20 * 60e3 });
    if (r.code === 0 && existsSync(tmp)) {
      if (existsSync(final)) rmSync(final, { recursive: true, force: true }); // only an empty dir can be here
      renameSync(tmp, final);
      return final;
    }
    rmSync(tmp, { recursive: true, force: true });
    if (r.code === 6) onRateLimit(row.key);
    log(row.key, `download ${sub} retry ${attempt} exit ${r.code} ${short(r.err, 120)}`);
    await sleep(15_000 * attempt);
  }
  throw new StepError("transient", `download of ${sub} failed`);
}
async function fetchTo(url, file) {
  if (existsSync(file)) return file;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`${file}.part`, buf);
  renameSync(`${file}.part`, file);
  return file;
}

function rightsFor(row) {
  const day = iso().slice(0, 10);
  const how = row.op === "retexture"
    ? `retextured from an original text style prompt on the game's existing mesh (${row.source})`
    : row.op === "rig" || row.op === "animate"
      ? "rigged/animated by Meshy from a Meshy-generated or game-owned mesh"
      : "from an original text prompt";
  return {
    licenseName: "Meshy generated asset (paid API, plan terms at generation time)",
    termsUrl: "https://www.meshy.ai/terms",
    rightsBasis: `Generated ${day} through the AuraOne Meshy account via Kiro Prism ${how} (GU47 WP-36, ${row.slug}/${row.key}). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.`
  };
}

/** Post-processing shared by every op: rights, optimize, (clip validation), isolated admission, summary. */
async function finishModel(st, row, input, { clips = [], metaFrom, thumbFrom } = {}) {
  const dir = rowDir(row);
  const rights = join(dir, "rights.json");
  if (!existsSync(rights)) writeFileSync(rights, JSON.stringify(rightsFor(row), null, 1) + "\n");
  const optDir = join(dir, "opt");
  const out = join(optDir, "model.glb");
  st.files = { ...(st.files ?? {}), input, rights, opt: out };
  if (!existsSync(out)) {
    mkdirSync(optDir, { recursive: true });
    const r = await aura(["assets", "optimize", "--file", input, "--out", out, "--role", row.role, "--json"]);
    const report = parseJson(r.stdout);
    st.optimize = { exit: r.code, vertsBefore: report?.vertsBefore, vertsAfter: report?.vertsAfter, bytesIn: report?.bytesIn, bytesOut: report?.bytesOut, simplified: report?.simplified, skinned: report?.skinned, error: r.code ? short(r.stderr || r.stdout, 400) : undefined };
    saveState(st);
    if (r.code !== 0 || !existsSync(out)) throw new Error(`optimize failed: ${st.optimize.error}`);
    log(row.key, `optimized ${Math.round(statSync(input).size / 1024)}KB -> ${Math.round(statSync(out).size / 1024)}KB`);
  }
  if (metaFrom && existsSync(metaFrom) && !existsSync(join(optDir, "meta.json"))) copyFileSync(metaFrom, join(optDir, "meta.json"));
  if (thumbFrom && existsSync(thumbFrom) && !existsSync(join(optDir, "thumbnail.png"))) copyFileSync(thumbFrom, join(optDir, "thumbnail.png"));
  st.summary = summarize(out);
  if (row.op === "rig" || row.op === "animate") {
    const names = st.summary.anims;
    if (clips.length > 0 && names.length === 0) {
      st.validation = { ok: false, failures: ["optimized GLB has no animations"] };
    } else {
      const args = ["assets", "validate-animation", "--require-rig", "--file", out];
      if (names.length > 0) args.push("--clips", names.join(","));
      if (clips.length > 0) args.push("--map", clips.map((c) => `${c}=${names.includes(c) ? c : names.find((n) => n.toLowerCase().includes(c.toLowerCase())) ?? c}`).join(","), "--require", clips.join(","));
      const r = await aura(args);
      const j = parseJson(r.stdout);
      st.validation = { exit: r.code, ok: r.code === 0, failures: (j?.failures ?? []).slice(0, 8).map((f) => short(f, 200)), clips: names, error: j ? undefined : short(r.stderr || r.stdout, 300) };
    }
    log(row.key, `validate-animation ${st.validation.ok ? "pass" : "fail"}`);
  }
  if (!st.admission) {
    const r = await aura(["assets", "import-meshy", optDir, "--into", join(BASE, row.slug, "_admit"), "--prefix", row.slug, "--name", row.key, "--rights-evidence", rights, "--profile", row.profile]);
    const j = parseJson(r.stdout);
    const messages = j?.messages ?? [];
    const blockers = messages.filter((m) => /^Admission blocker:/.test(m)).map((m) => short(m.replace(/^Admission blocker:\s*/, ""), 200));
    st.admission = {
      exit: r.code,
      ok: Boolean(j?.ok),
      routeReady: Boolean(j?.ok) && blockers.length === 0,
      blockers,
      unproven: messages.filter((m) => /^Admission unproven:/.test(m)).map((m) => short(m.replace(/^Admission unproven:\s*/, ""), 160)),
      typedKey: j?.typedKey,
      model: j?.model,
      sha256: j?.sha256,
      failures: (j?.failures ?? []).slice(0, 8).map((f) => short(f, 200)),
      warnings: (j?.warnings ?? []).slice(0, 6).map((f) => short(f, 200)),

      error: j ? undefined : short(r.stderr || r.stdout, 400)
    };
    log(row.key, `admission ${st.admission.ok ? `ok, ${blockers.length} blockers` : "FAIL"} ${blockers[0] ?? st.admission.failures?.[0] ?? st.admission.error ?? ""}`);
  }
  st.status = "done";
  st.reason = undefined;
  st.doneAt = iso();
  saveState(st);
}

// ---------- ops ----------
async function opTextTo3d(st, row) {
  const preview = ["--mode", "preview", "--prompt", row.prompt];
  if (row.poseMode) preview.push("--pose-mode", row.poseMode);
  await paidTask(st, row, "preview", { resource: "text-to-3d", op: "preview", args: preview, pinned: false });
  const refine = ["--mode", "refine", "--preview-task-id", st.tasks.preview.taskId, "--enable-pbr", "true", "--texture-resolution", row.textureRes ?? "2k", "--remove-lighting", "true"];
  if (row.texturePrompt) refine.push("--texture-prompt", row.texturePrompt);
  await paidTask(st, row, "refine", { resource: "text-to-3d", op: "refine", args: refine, pinned: true });
  const raw = await download(row, "text-to-3d", st.tasks.refine.taskId, "raw");
  await finishModel(st, row, join(raw, "model.glb"), { metaFrom: join(raw, "meta.json"), thumbFrom: join(raw, "thumbnail.png") });
}

async function opRetexture(st, row) {
  const source = sourcePath(row.source);
  if (!existsSync(source)) throw new StepError("usage", `source GLB missing: ${row.source}`);
  const args = ["--model-url", source, "--text-style-prompt", row.prompt, "--enable-original-uv", String(row.sourceInfo?.uv !== false), "--enable-pbr", "true", "--texture-resolution", row.textureRes ?? "2k"];
  await paidTask(st, row, "retexture", { resource: "retexture", op: "retexture", args, pinned: false });
  const raw = await download(row, "retexture", st.tasks.retexture.taskId, "raw");
  if (!st.geometry) {
    const r = await run(process.execPath, [GEOMETRY_HASH, source, join(raw, "model.glb")]);
    const j = parseJson(r.stdout);
    st.geometry = j ? { untouched: j.geometryUntouched, before: j.before, after: j.after, primitives: j.primitiveCount } : { error: short(r.stderr || r.stdout, 200) };
    saveState(st);
    log(row.key, `geometry ${st.geometry.untouched ? "untouched" : "changed"}`);
  }
  await finishModel(st, row, join(raw, "model.glb"), { metaFrom: join(raw, "meta.json"), thumbFrom: join(raw, "thumbnail.png") });
}

function depState(row) {
  const dep = byKey.get(row.dependsOn);
  return dep ? loadState(dep.key) : undefined;
}

async function opRig(st, row) {
  let args;
  let pinned = false;
  if (row.dependsOn) {
    const refineId = depState(row)?.tasks?.refine?.taskId;
    if (!refineId) throw new StepError("dep", `dependency ${row.dependsOn} has no refine task`);
    args = ["--input-task-id", refineId];
    pinned = true;
  } else {
    const source = sourcePath(row.source ?? "");
    if (!row.source || !existsSync(source)) throw new StepError("usage", `rig source missing: ${row.source}`);
    args = ["--model-url", source];
  }
  args.push("--height-meters", String(row.heightMeters ?? 1.7));
  const { task } = await paidTask(st, row, "rig", { resource: "rigging", op: "rigging", args, pinned });
  const raw = await download(row, "rigging", st.tasks.rig.taskId, "raw");
  const rigged = join(raw, "rigged_character_glb.glb");
  const merged = join(rowDir(row), "merged", "model.glb");
  const clips = [];
  if (!existsSync(merged)) {
    const info = task ?? (await getTask(row, "rigging", st.tasks.rig.taskId));
    const basic = info?.result?.basic_animations ?? {};
    const clipDir = join(rowDir(row), "clips");
    mkdirSync(clipDir, { recursive: true });
    const pairs = [];
    for (const [clip, field] of [["walk", "walking_glb_url"], ["run", "running_glb_url"]]) {
      if (typeof basic[field] !== "string") continue;
      try {
        pairs.push(`${clip}=${await fetchTo(basic[field], join(clipDir, `${clip}.glb`))}`);
        clips.push(clip);
      } catch (e) {
        log(row.key, `basic ${clip} download failed: ${e.message}`);
      }
    }
    if (pairs.length > 0) {
      const r = await aura(["assets", "merge-clips", "--base", rigged, "--out", merged, ...pairs, "--json"]);
      st.merge = { exit: r.code, report: parseJson(r.stdout)?.clips, error: r.code ? short(r.stderr || r.stdout, 300) : undefined };
      saveState(st);
    }
  } else {
    clips.push(...summarize(merged).anims);
  }
  const input = existsSync(merged) ? merged : rigged;
  await finishModel(st, row, input, { clips: existsSync(merged) ? clips : [], metaFrom: join(raw, "meta.json") });
}

async function opAnimate(st, row) {
  let rigTaskId = row.rigTaskId;
  let base;
  if (!rigTaskId) {
    const dep = depState(row);
    rigTaskId = dep?.tasks?.rig?.taskId;
    if (!rigTaskId) throw new StepError("dep", `dependency ${row.dependsOn} has no rig task`);
    base = join(rowDir(byKey.get(row.dependsOn)), "raw", "rigged_character_glb.glb");
  } else {
    const rigDir = await download(row, "rigging", rigTaskId, "rig");
    base = join(rigDir, "rigged_character_glb.glb");
  }
  const pairs = [];
  let firstMeta;
  for (const clip of row.clips ?? []) {
    const name = `anim-${clip.clip}`;
    await paidTask(st, row, name, { resource: "animate", op: "animate", args: ["--rig-task-id", rigTaskId, "--action-id", String(clip.actionId)], pinned: true });
    const dir = await download(row, "animate", st.tasks[name].taskId, join("clips", clip.clip));
    firstMeta ??= join(dir, "meta.json");
    pairs.push(`${clip.clip}=${join(dir, "animation_glb.glb")}`);
  }
  const merged = join(rowDir(row), "merged", "model.glb");
  if (!existsSync(merged)) {
    const r = await aura(["assets", "merge-clips", "--base", base, "--out", merged, ...pairs, "--json"]);
    st.merge = { exit: r.code, report: parseJson(r.stdout)?.clips, error: r.code ? short(r.stderr || r.stdout, 300) : undefined };
    saveState(st);
    if (r.code !== 0 || !existsSync(merged)) throw new Error(`merge-clips failed: ${st.merge.error}`);
  }
  await finishModel(st, row, merged, { clips: (row.clips ?? []).map((c) => c.clip), metaFrom: firstMeta });
}

const OPS = { "text-to-3d": opTextTo3d, retexture: opRetexture, rig: opRig, animate: opAnimate };

// ---------- scheduler ----------
function orderRows(filter) {
  const games = Object.keys(plan.games);
  const out = [];
  for (const pri of ["P1", "P2", "P3"]) {
    const lists = games.map((g) => rows.filter((r) => r.slug === g && r.priority === pri && filter(r)));
    for (let i = 0; lists.some((l) => i < l.length); i += 1) for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}
const startedPaid = (st) => Boolean(st && Object.values(st.tasks ?? {}).some((t) => t.taskId || t.rid));
function needsNewUnpinned(row, st) {
  if (row.op === "text-to-3d") return !st?.tasks?.preview?.taskId;
  if (row.op === "retexture") return !st?.tasks?.retexture?.taskId;
  if (row.op === "rig") return !row.dependsOn && !st?.tasks?.rig?.taskId;
  return false;
}

async function processRow(row, runInfo) {
  const st = stateFor(row);
  st.status = "active";
  st.reason = undefined;
  saveState(st);
  try {
    if (BANNED.test(row.key) || BANNED.test(row.prompt ?? "") || BANNED.test(row.texturePrompt ?? "")) throw new StepError("usage", "banned legacy word in key or prompt");
    await OPS[row.op](st, row);
    log(row.key, `done (${row.op}, ${st.summary?.tris ?? "?"} tris)`);
  } catch (e) {
    const kind = e instanceof StepError ? e.kind : "post";
    const message = short(e.message, 300);
    if (kind === "credits") {
      // Prism tries only a few keys per call: keys that report a balance but answer 402 get parked after the refusal,
      // so a refusal while usable keys still hold credits is retried; a refusal streak or an empty pool stops new work.
      refusalStreak += 1;
      const cost = { "text-to-3d": 20, retexture: 10, rig: 5 }[row.op] ?? 20;
      st.status = "pending";
      if (refusalStreak <= 8 && (await poolHasCapacity(cost))) {
        st.reason = "Prism refused while usable keys hold credits; retrying";
        runInfo.retryAt.set(row.key, Date.now() + 20_000 * refusalStreak);
        log(row.key, `Prism refusal ${refusalStreak} with pool capacity left; retry`);
      } else {
        if (!STOP_NEW) log(row.key, `pool refused (${message}); no new unpinned paid calls this run`);
        STOP_NEW = true;
        st.reason = "pool exhausted: retry after keys reset";
      }
    } else if (kind === "auth") {
      STOP_ALL = true;
      st.status = "pending";
      st.reason = `Prism/Meshy auth refusal: ${message}`;
      log(row.key, `AUTH refusal, stopping: ${message}`);
    } else if (kind === "stopped") {
      st.status = "pending";
      st.reason = "stopped before a new paid call";
    } else if (kind === "rate" || kind === "transient" || kind === "slow" || kind === "lost-task") {
      runInfo.transient.set(row.key, (runInfo.transient.get(row.key) ?? 0) + 1);
      const n = runInfo.transient.get(row.key);
      st.status = n >= 3 ? "deferred" : "pending";
      st.reason = `${kind}: ${message}`;
      runInfo.retryAt.set(row.key, Date.now() + 120_000 * n);
      if (n >= 3) runInfo.skip.add(row.key);
      log(row.key, `${kind} (${n}): ${message}`);
    } else if (kind === "pinned-exhausted") {
      st.status = "deferred";
      st.reason = `parent task's Meshy key is out of credits: ${message}`;
      runInfo.skip.add(row.key);
      log(row.key, `deferred: ${message}`);
    } else if (kind === "task-failed") {
      st.status = (st.attempts ?? 0) >= 2 ? "failed" : "pending";
      st.reason = message;
      if (st.status === "failed") runInfo.skip.add(row.key);
      log(row.key, `task failed (attempt ${st.attempts}): ${message}`);
    } else if (kind === "dep") {
      st.status = "pending";
      st.reason = message;
      runInfo.retryAt.set(row.key, Date.now() + 60_000);
    } else {
      // invalid (4xx), usage (bad input) and post-processing errors: visible, not retried unless --retry-failed
      st.status = kind === "usage" ? "blocked" : "failed";
      st.reason = `${kind}: ${message}`;
      runInfo.skip.add(row.key);
      log(row.key, `${st.status}: ${message}`);
    }
    saveState(st);
  }
}

function acquireLock() {
  const lock = join(STATE, "pipeline.lock");
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === "EPERM"; }
    if (alive && pid !== process.pid) {
      console.error(`another pipeline run is active (pid ${pid}); stop it first or wait`);
      process.exit(2);
    }
  }
  writeFileSync(lock, String(process.pid));
  const release = () => { try { if (Number(readFileSync(lock, "utf8")) === process.pid) rmSync(lock); } catch { /* ignore */ } };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      if (sig === "SIGHUP") return; // nohup: keep running
      log("-", `${sig}: exiting; in-flight task ids are saved and resume on the next run`);
      STOP_ALL = true;
      release();
      process.exit(130);
    });
  }
}

function counts() {
  const c = { done: 0, active: 0, pending: 0, deferred: 0, failed: 0, blocked: 0 };
  for (const r of rows) c[loadState(r.key)?.status ?? "pending"] = (c[loadState(r.key)?.status ?? "pending"] ?? 0) + 1;
  return c;
}
async function gu47Spent() {
  const L = await ledger();
  const totals = L.meshyLedgerTotals(L.readMeshyLedger());
  return Object.entries(totals.byGame).filter(([g]) => g.startsWith("gu47-")).reduce((s, [, v]) => s + v, 0);
}

async function runPipeline() {
  mkdirSync(ROWS, { recursive: true });
  const priorities = list("--priority") ?? ["P1", "P2", "P3"];
  const keys = list("--keys");
  const games = list("--games");
  const filter = (r) => priorities.includes(r.priority) && (!keys || keys.includes(r.key)) && (!games || games.includes(r.slug));
  let queue = orderRows(filter);
  if (keys) queue = keys.map((k) => byKey.get(k)).filter(Boolean).filter(filter);
  const retryFailed = has("--retry-failed");
  for (const row of queue) {
    const st = loadState(row.key);
    if (st?.status === "active") st.status = "pending"; // left over from a stopped run
    if (retryFailed && st && (st.status === "failed" || st.status === "deferred")) { st.status = "pending"; saveState(st); }
    if (st?.status === "deferred" && !retryFailed) { st.status = "pending"; } // deferred rows are retried once per run
  }
  // rows with paid work in flight first, so paid previews/tasks finish before new ones start
  queue = [...queue.filter((r) => startedPaid(loadState(r.key)) && loadState(r.key)?.status !== "done"), ...queue.filter((r) => !(startedPaid(loadState(r.key)) && loadState(r.key)?.status !== "done"))];
  const limit = Number(opt("--limit", "0"));
  if (has("--dry-run")) {
    const todo = queue.filter((r) => loadState(r.key)?.status !== "done");
    console.log(`dry run: ${todo.length} rows to process; first 30:`);
    for (const r of todo.slice(0, 30)) console.log(`  ${r.priority} ${r.slug} ${r.key} ${r.op} ${r.profile}`);
    return;
  }
  const version = (await run(MESHY_BIN, ["--version"])).stdout.trim();
  if (version !== "0.2.0") throw new Error(`meshy CLI ${version || "missing"}; the repository pins 0.2.0`);
  acquireLock();
  const pool = await poolSnapshot("run start");
  if (pool && !existsSync(join(STATE, "baseline.json"))) {
    const L = await ledger();
    const rec = L.recordMeshyBaseline(L.parsePrismPool(pool), { note: "gu47 wp36 pipeline start" });
    writeFileSync(join(STATE, "baseline.json"), JSON.stringify({ at: rec.ts, rid: rec.rid, poolRemaining: rec.pool_remaining, poolTotalsRemaining: pool.totals?.remaining_credits, ledgerSpent: rec.ledger_spent }, null, 1));
    log("-", `ledger baseline recorded: pool ${rec.pool_remaining}`);
  }
  log("-", `run start: ${queue.length} rows queued (${priorities.join(",")}), concurrency ${concurrency}/${maxConcurrency}, pool ${pool?.totals?.remaining_credits ?? "?"}`);
  const runInfo = { transient: new Map(), retryAt: new Map(), skip: new Set() };
  const active = new Map();
  let started = 0;
  let lastBeat = 0;
  let lastPool = Date.now();
  let lastPoolMax = Date.now();
  if (pool) poolMax = maxUsable(pool);
  const pick = () => {
    const now = Date.now();
    for (const row of queue) {
      if (active.has(row.key) || runInfo.skip.has(row.key)) continue;
      const st = loadState(row.key);
      if (st?.status === "done" || st?.status === "blocked") continue;
      if (st?.status === "failed" && !retryFailed) continue;
      if ((runInfo.retryAt.get(row.key) ?? 0) > now) continue;
      if (row.dependsOn) {
        const dep = loadState(row.dependsOn);
        if (!dep || dep.status !== "done") {
          if (dep && (dep.status === "failed" || dep.status === "blocked")) {
            const mine = stateFor(row);
            mine.status = "blocked";
            mine.reason = `dependency ${row.dependsOn} is ${dep.status}`;
            saveState(mine);
            runInfo.skip.add(row.key);
          }
          continue;
        }
      }
      if (STOP_ALL) return undefined;
      if (needsNewUnpinned(row, st) && (STOP_NEW || (poolMax !== undefined && poolMax < (NEW_COST[row.op] ?? 30)))) continue;
      return row;
    }
    return undefined;
  };
  for (;;) {
    while (active.size < concurrency && !(limit && started >= limit)) {
      const row = pick();
      if (!row) break;
      started += 1;
      active.set(row.key, processRow(row, runInfo).finally(() => active.delete(row.key)));
    }
    if (active.size === 0) {
      const waiting = queue.filter((r) => !runInfo.skip.has(r.key) && !["done", "blocked", "failed"].includes(loadState(r.key)?.status) && (runInfo.retryAt.get(r.key) ?? 0) > Date.now());
      if (waiting.length === 0 && has("--wait-for-credits") && !STOP_ALL && !(limit && started >= limit)) {
        // opt-in: everything left is blocked by the pool, so sleep and resume when a key can pay again (monthly resets)
        const blocked = queue.filter((r) => !["done", "blocked", "failed"].includes(loadState(r.key)?.status) && (needsNewUnpinned(r, loadState(r.key)) || loadState(r.key)?.status === "deferred"));
        if (blocked.length > 0) {
          // Keys that answer 402 while reporting a balance flip back to "ok" between refreshes, so the pool is only
          // re-tried after the next key reset Prism reports (then every 30 min), not on every flip.
          const before = await poolSnapshot("wait for credits");
          const reset = Date.parse(before?.totals?.next_reset_at ?? "");
          const until = Number.isFinite(reset) && reset > Date.now() ? reset + 5 * 60e3 : Date.now() + 30 * 60e3;
          log("==", `${blocked.length} rows wait for credits until ${new Date(until).toISOString()} (next key reset)`);
          while (Date.now() < until && !STOP_ALL) await sleep(Math.min(30 * 60e3, until - Date.now()));
          const p = await poolSnapshot("wait for credits");
          if (p && maxUsable(p) >= 30 && (p.totals?.remaining_credits ?? 0) >= 30) {
            poolMax = maxUsable(p);
            STOP_NEW = false;
            refusalStreak = 0;
            for (const r of blocked) if (loadState(r.key)?.status === "deferred") { runInfo.skip.delete(r.key); runInfo.transient.delete(r.key); }
            log("==", `pool can pay again (largest usable key ${poolMax}); resuming`);
          }
          continue;
        }
      }
      if (waiting.length === 0 || (limit && started >= limit) || STOP_ALL) break;
      await sleep(Math.min(...waiting.map((r) => runInfo.retryAt.get(r.key))) - Date.now() + 1000);
      continue;
    }
    await Promise.race([...active.values(), sleep(10_000)]);
    maybeRaise();
    if (Date.now() - lastPoolMax > 120_000) {
      lastPoolMax = Date.now();
      const p = await poolSnapshot("capacity");
      if (p) poolMax = maxUsable(p);
    }
    if (Date.now() - lastBeat > 5 * 60e3) {
      lastBeat = Date.now();
      let poolLine = "";
      if (Date.now() - lastPool > 15 * 60e3) {
        lastPool = Date.now();
        const p = await poolSnapshot("heartbeat");
        poolLine = p ? ` pool ${p.totals?.remaining_credits}` : "";
      }
      const c = counts();
      log("==", `done ${c.done}/${rows.length} active ${active.size} conc ${concurrency} pending ${c.pending} deferred ${c.deferred} failed ${c.failed} blocked ${c.blocked} gu47 credits ${await gu47Spent()}${poolLine}${STOP_NEW ? " STOP_NEW" : ""}`);
    }
  }
  const end = await poolSnapshot("run end");
  const c = counts();
  log("==", `run end: done ${c.done}/${rows.length} pending ${c.pending} deferred ${c.deferred} failed ${c.failed} blocked ${c.blocked}; gu47 credits ${await gu47Spent()}; pool ${end?.totals?.remaining_credits ?? "?"}${STOP_NEW ? "; stopped new paid work (pool refused)" : ""}`);
}

// ---------- reports ----------
function statusReport() {
  const byPri = {};
  const errors = [];
  for (const r of rows) {
    const st = loadState(r.key);
    const s = st?.status ?? "pending";
    byPri[r.priority] ??= {};
    byPri[r.priority][s] = (byPri[r.priority][s] ?? 0) + 1;
    if (st?.reason && s !== "done") errors.push(`${r.key} [${s}] ${st.reason}`);
  }
  const lock = join(STATE, "pipeline.lock");
  let running = "no";
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    try { process.kill(pid, 0); running = `pid ${pid}`; } catch { running = `stale lock (pid ${pid})`; }
  }
  console.log(`pipeline running: ${running}`);
  console.log(JSON.stringify(byPri));
  console.log(`active: ${rows.filter((r) => loadState(r.key)?.status === "active").map((r) => r.key).join(", ") || "none"}`);
  for (const e of errors.slice(-25)) console.log(`  ${short(e, 200)}`);
}

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
function catalogue() {
  const lines = [];
  const c = counts();
  lines.push("# WP-36 asset catalogue (GU47)", "");
  lines.push(`Generated ${iso()} by \`wp36-pipeline.mjs --catalogue\` from \`artifacts/gu47-meshy/_state/rows/\`. Plan: [wp36-plan.md](wp36-plan.md). Paths are absolute in the wp36 worktree; \`artifacts/\` is gitignored, so wave-2 game lanes copy from \`<slug>/_admit/models/<typedKey>.glb\` (admitted, hashed) or re-admit \`opt/model.glb\` into their own asset folder.`, "");
  lines.push(`Rows: ${rows.length}; done ${c.done}, active ${c.active}, pending ${c.pending}, deferred ${c.deferred}, failed ${c.failed}, blocked ${c.blocked}.`, "");
  lines.push("Columns: optimized GLB (`aura3d assets optimize --role <role>`), rights evidence, admission profile, triangles, embedded textures, local bounds in metres (x, y, z), clips, isolated admission result (`import-meshy --into <slug>/_admit`), ledger reservation ids and Meshy task ids.", "");
  const games = Object.keys(plan.games);
  for (const slug of games) {
    const gameRows = rows.filter((r) => r.slug === slug);
    const touched = gameRows.filter((r) => loadState(r.key));
    const g = plan.games[slug];
    lines.push(`## ${g.lane} ${slug} (prefix \`${g.prefix}\`)`, "");
    const done = touched.filter((r) => loadState(r.key).status === "done").length;
    lines.push(`${done} done of ${gameRows.length} planned (${gameRows.filter((r) => r.priority === "P1").length} P1).`, "");
    if (touched.length === 0) { lines.push("Not started.", ""); continue; }
    lines.push("| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of touched) {
      const st = loadState(r.key);
      const s = st.summary ?? {};
      const tasks = Object.entries(st.tasks ?? {}).filter(([, t]) => t.taskId || t.rid);
      const a = st.admission;
      const adm = a ? (a.ok ? `admitted (candidate) \`${a.typedKey ?? ""}\`${a.blockers?.length ? `; ${a.blockers.length} blocker(s): ${short(a.blockers[0], 110)}` : "; no blockers"}` : `fail: ${short(a.failures?.[0] ?? a.error ?? "", 140)}`) : "";
      const val = st.validation ? ` / anim ${st.validation.ok ? "pass" : "fail"}` : "";
      const geo = st.geometry ? ` / geometry ${st.geometry.untouched ? "untouched" : "changed"}` : "";
      lines.push(`| \`${r.key}\` | ${r.op} | ${r.priority} | ${cell(st.status === "done" ? "done" : `${st.status}${st.reason ? `: ${short(st.reason, 90)}` : ""}`)} | ${st.files?.opt && existsSync(st.files.opt) ? `\`${st.files.opt}\`` : ""} | ${st.files?.rights ? `\`${st.files.rights}\`` : ""} | ${r.profile} | ${s.tris ?? ""} | ${cell((s.images ?? []).join(", "))} | ${s.bounds ? s.bounds.join(" x ") : ""} | ${cell((s.anims ?? []).join(", "))} | ${cell(adm + val + geo)} | ${tasks.map(([n, t]) => `${n}:${t.rid ?? ""}`).join(" ")} | ${tasks.map(([n, t]) => `${n}:${t.taskId ?? ""}`).join(" ")} |`);
    }
    lines.push("");
  }
  lines.push("## Impostor candidates (phase 2, needs a browser)", "");
  lines.push("Background (`role: background`) rows are the impostor-bake candidates; baking runs in phase 2 on the remote runner:", "");
  const bg = rows.filter((r) => r.role === "background");
  for (const slug of games) {
    const keysForGame = bg.filter((r) => r.slug === slug).map((r) => `\`${r.key}\``);
    if (keysForGame.length) lines.push(`- ${slug}: ${keysForGame.join(", ")}`);
  }
  lines.push("");
  writeFileSync(CATALOGUE, lines.join("\n"));
  console.log(`wrote ${CATALOGUE}`);
}

async function ledgerMarkdown() {
  const L = await ledger();
  const merged = new Map();
  for (const rec of L.readMeshyLedger()) if (!rec.kind) merged.set(rec.rid, { ...(merged.get(rec.rid) ?? {}), ...rec });
  const mine = [...merged.values()].filter((r) => r.game?.startsWith("gu47-"));
  const cost = (r) => (r.status === "failed" ? 0 : r.actual ?? r.est ?? 0);
  const byGame = {};
  const byOp = {};
  const byStatus = {};
  for (const r of mine) {
    const g = r.game.slice(5);
    byGame[g] ??= { total: 0, calls: 0, ops: {} };
    byGame[g].total += cost(r);
    byGame[g].calls += 1;
    byGame[g].ops[r.op] = (byGame[g].ops[r.op] ?? 0) + cost(r);
    byOp[r.op] ??= { credits: 0, calls: 0, failed: 0 };
    byOp[r.op].credits += cost(r);
    byOp[r.op].calls += 1;
    if (r.status === "failed") byOp[r.op].failed += 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  const total = mine.reduce((s, r) => s + cost(r), 0);
  const ops = ["preview", "refine", "retexture", "rigging", "animate"];
  const lines = ["# GU47 Meshy ledger (WP-36)", ""];
  lines.push(`Generated ${iso()} by \`wp36-pipeline.mjs ledger-md\` from \`~/.aura3d/meshy-ledger.jsonl\` (tags \`gu47-<slug>\`, latest record per reservation wins; failed calls count 0, reserved/unconfirmed count their estimate).`, "");
  lines.push(`Total: **${total} credits** over ${mine.length} paid calls (${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}).`, "");
  lines.push("## By op", "", "| Op | Calls | Failed (0 credits) | Credits |", "|---|---|---|---|");
  for (const op of Object.keys(byOp)) lines.push(`| ${op} | ${byOp[op].calls} | ${byOp[op].failed} | ${byOp[op].credits} |`);
  lines.push("", "## By game", "", `| Game | Calls | ${ops.join(" | ")} | Total |`, `|---|---|${ops.map(() => "---|").join("")}---|`);
  for (const slug of Object.keys(plan.games)) {
    const g = byGame[slug];
    if (!g) { lines.push(`| ${slug} | 0 | ${ops.map(() => "0").join(" | ")} | 0 |`); continue; }
    lines.push(`| ${slug} | ${g.calls} | ${ops.map((o) => g.ops[o] ?? 0).join(" | ")} | ${g.total} |`);
  }
  lines.push("", "## Reconciliation with the Kiro Prism pool", "");
  let base;
  try { base = JSON.parse(readFileSync(join(STATE, "baseline.json"), "utf8")); } catch { base = undefined; }
  try {
    const raw = await poolRaw();
    const pool = L.parsePrismPool(raw);
    const rec = L.reconcileWithPrism(pool);
    const baseKeys = [...L.readMeshyLedger()].reverse().find((r) => r.kind === "baseline")?.pool_keys ?? {};
    const okDrop = (raw.keys ?? []).filter((k) => k.state === "ok" && baseKeys[k.id] !== undefined).reduce((s, k) => s + Math.max(0, baseKeys[k.id] - k.remaining), 0);
    const parked = (raw.keys ?? []).filter((k) => k.state !== "ok" && baseKeys[k.id] !== undefined && baseKeys[k.id] > k.remaining).map((k) => `${k.id} ${baseKeys[k.id]} -> ${k.remaining}`);
    lines.push(`- Baseline (pipeline start, ${base?.at ?? rec.baselineAt}): pool ${base?.poolRemaining ?? "?"} credits (sum of key balances; Prism usable total ${base?.poolTotalsRemaining ?? "?"}).`);
    lines.push(`- Now (${iso()}): pool ${pool.remaining} credits (sum of key balances); usable (keys in state ok, Prism totals): **${raw.totals?.remaining_credits ?? "?"}**.`);
    lines.push(`- Ledger \`reconcile\` since the baseline: Prism ${rec.prismSpent}, ledger ${rec.ledgerSpent} (GU47 tags ${total}), delta ${rec.delta}.`);
    lines.push(`- Balance drop on keys that are still usable: ${okDrop} credits vs GU47 ledger ${total} (difference ${okDrop - total}; reserved/in-flight tasks count in the ledger before Meshy charges them).`);
    lines.push(`- Keys parked by Prism after answering HTTP 402 although they report a balance (Prism sets their local balance to 0; not a Meshy charge, they return at their reset): ${parked.length ? parked.join(", ") : "none"}.`);
    lines.push(`- Keys topped up or reset since the baseline (excluded, never negative spend): ${rec.keysToppedUp.length ? rec.keysToppedUp.join(", ") : "none"}; unconfirmed reservations: ${rec.unconfirmedRids.length}.`);
    lines.push("- The pool is shared, so other consumers, monthly resets and top-ups move the Prism number; a positive delta means Prism charged more than the ledger counted.");
  } catch (e) {
    lines.push(`- Pool read failed: ${short(e.message)}`);
  }
  lines.push("");
  mkdirSync(dirname(LEDGER_MD), { recursive: true });
  writeFileSync(LEDGER_MD, lines.join("\n"));
  console.log(`wrote ${LEDGER_MD}`);
}

const command = has("--catalogue") ? "catalogue" : argv[0] && !argv[0].startsWith("--") ? argv[0] : "run";
try {
  if (command === "run") await runPipeline();
  else if (command === "status") statusReport();
  else if (command === "catalogue") catalogue();
  else if (command === "ledger-md") await ledgerMarkdown();
  else { console.error("usage: wp36-pipeline.mjs run|status|ledger-md|--catalogue [options]"); process.exitCode = 2; }
} catch (e) {
  console.error(`${hhmmss()} fatal: ${short(e.stack ?? e.message, 600)}`);
  process.exitCode = 1;
}
