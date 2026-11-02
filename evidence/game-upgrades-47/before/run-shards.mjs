#!/usr/bin/env node
// Run luma-capture shards (shards.json rows: { run, slug, specs, expect }) on the remote runner, at most --max at a time,
// each through tools/remote-acr/run.sh, then decode every finished log with evidence/audit-fix/e5/decode-luma.mjs.
//
//   node evidence/game-upgrades-47/before/run-shards.mjs --shards <shards.json> --tag <image tag> --out <evidence dir>
//        [--state <dir>] [--max 4] [--build] [--only run1,run2] [--hang-min 25]
//
// --build: the first selected shard builds the image (BUILD=1, CONTEXT_PROFILE=full, EXTRA_DIRS = the app folder of every
// live game in the shards file); the others wait for that build and reuse it (BUILD=0 IMAGE_TAG=<tag>). Without --build
// every shard reuses <tag>. KEEP_IMAGE stays 1 (the run.sh default): deleting the tag would break the shards still using it.
// A run whose step has started but logged no new GL_META line for --hang-min minutes is cancelled
// (az acr task cancel-run, lesson V3). Console output of each run.sh goes to <state>/<run>.console (it carries base64
// frames: never print it); the scheduler log and status.json in <state> hold only short lines.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const flag = (name) => argv.includes(`--${name}`);
const shardsFile = opt("shards");
const tag = opt("tag");
const outRoot = opt("out");
const state = opt("state", "/tmp/gu47-wp38");
const max = Number(opt("max", "4"));
const hangMs = Number(opt("hang-min", "25")) * 60_000;
const only = opt("only") ? new Set(opt("only").split(",")) : null;
const build = flag("build");
if (!shardsFile || !tag || !outRoot) { console.error("usage: --shards <file> --tag <image tag> --out <evidence dir>"); process.exit(2); }

const AZ = "az-auraone-gurbaksh", ACR = "picassostagingacr", RG = "PICASSO-STAGING-RG";
const all = JSON.parse(readFileSync(shardsFile, "utf8"));
const shards = all.filter((s) => !only || only.has(s.run));
const apps = [...new Set(all.map((s) => `apps/showcase-${s.slug}`))].filter((d) => existsSync(d));
mkdirSync(state, { recursive: true });
const logFile = join(state, "scheduler.log");
const say = (msg) => { const line = `${new Date().toISOString()} ${msg}`; appendFileSync(logFile, line + "\n"); };
const runDir = (run) => join("tests/reports/remote-acr", run);
const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const count = (text, re) => (text.match(re) ?? []).length;

const jobs = shards.map((s, i) => ({ ...s, idx: i, status: "pending", acrId: null, meta: 0, done: 0, ready: 0, http: 0, lastMetaAt: null, stepAt: null, startedAt: null, finishedAt: null, rc: null, pw: null, cancelled: false, builder: build && i === 0 }));
let buildState = build ? "pending" : "ok";

function start(job) {
  const env = { ...process.env, RUN_ID: job.run, IMAGE_TAG: tag, SPECS: job.specs, BUILD: job.builder ? "1" : "0", KEEP_IMAGE: "1" };
  if (job.builder) { env.CONTEXT_PROFILE = "full"; env.EXTRA_DIRS = apps.join(" "); }
  const fd = openSync(join(state, `${job.run}.console`), "a");
  const child = spawn("tools/remote-acr/run.sh", [], { env, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  job.child = child; job.status = job.builder ? "building" : "running"; job.startedAt = Date.now();
  if (job.builder) buildState = "building";
  say(`start ${job.run} build=${env.BUILD} specs=${job.specs}${job.builder ? ` extraDirs=${apps.length}` : ""}`);
  child.on("exit", (code) => finish(job, code));
}

function finish(job, code) {
  const log = read(join(runDir(job.run), "acr-run.log"));
  job.rc = code; job.finishedAt = Date.now(); job.child = null;
  job.pw = (/PLAYWRIGHT_EXIT=(\d+)/.exec(log) ?? [])[1] ?? null;
  job.acrId = job.acrId ?? (/Queued a run with ID: (\w+)/.exec(log) ?? [])[1] ?? null;
  job.status = job.cancelled ? "cancelled" : code === 0 ? "passed" : "failed";
  if (job.builder && buildState !== "ok") buildState = /build ok/.test(read(join(state, `${job.run}.console`))) ? "ok" : "failed";
  say(`exit ${job.run} rc=${code} pw=${job.pw} acr=${job.acrId} meta=${count(log, /^GL_META /gm)} done=${count(log, /^GL_DONE /gm)} ${job.status}`);
  if (log) {
    try {
      const out = execFileSync("node", ["evidence/audit-fix/e5/decode-luma.mjs", `${job.run}=${join(runDir(job.run), "acr-run.log")}`, "--out", join(outRoot, job.slug)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      writeFileSync(join(state, `${job.run}.decode.txt`), out);
      say(`decoded ${job.run} -> ${join(outRoot, job.slug)}`);
    } catch (e) { say(`decode-failed ${job.run} ${String(e.message).slice(0, 200)}`); }
  }
}

function cancel(job, why) {
  if (!job.acrId) { say(`cannot-cancel ${job.run} (no acr id) ${why}`); return; }
  job.cancelled = true;
  say(`cancel ${job.run} acr=${job.acrId} ${why}`);
  try { execFileSync(AZ, ["acr", "task", "cancel-run", "-r", ACR, "-g", RG, "--run-id", job.acrId, "-o", "none"], { stdio: "ignore" }); } catch (e) { say(`cancel-failed ${job.run} ${String(e.message).slice(0, 160)}`); }
}

function poll() {
  const now = Date.now();
  if (build && buildState === "building") {
    const builder = jobs.find((j) => j.builder);
    const cons = read(join(state, `${builder.run}.console`));
    if (/build ok/.test(cons)) { buildState = "ok"; builder.status = "running"; say(`build ok (${tag})`); }
    else if (/FATAL/.test(cons)) { buildState = "failed"; say("build FATAL"); }
  }
  for (const job of jobs.filter((j) => j.child)) {
    const log = read(join(runDir(job.run), "acr-run.log"));
    job.acrId = job.acrId ?? (/Queued a run with ID: (\w+)/.exec(log) ?? [])[1] ?? null;
    if (!job.stepAt && /\[task-run\] run_id=/.test(log)) { job.stepAt = now; job.lastMetaAt = now; }
    const meta = count(log, /^GL_META /gm);
    if (meta !== job.meta) { job.meta = meta; job.lastMetaAt = now; }
    job.done = count(log, /^GL_DONE /gm); job.ready = count(log, /^GL_READY /gm); job.http = count(log, /^GL_HTTP /gm);
    if (job.stepAt && !job.cancelled && now - job.lastMetaAt > hangMs) cancel(job, `no GL_META for ${Math.round((now - job.lastMetaAt) / 60000)} min`);
  }
  const active = jobs.filter((j) => j.child).length;
  if (buildState === "failed") { for (const j of jobs.filter((x) => x.status === "pending")) j.status = "skipped"; }
  else {
    let free = max - active;
    for (const job of jobs.filter((j) => j.status === "pending")) {
      if (free <= 0) break;
      if (!job.builder && buildState !== "ok") break;
      start(job); free--;
    }
  }
  writeFileSync(join(state, "status.json"), JSON.stringify({ at: new Date(now).toISOString(), tag, buildState, jobs: jobs.map(({ child, ...j }) => j) }, null, 1));
  if (jobs.every((j) => !j.child && j.status !== "pending")) { say("all shards finished"); clearInterval(timer); }
}

say(`scheduler start shards=${shards.length} tag=${tag} max=${max} build=${build}`);
const timer = setInterval(poll, 30_000);
poll();
