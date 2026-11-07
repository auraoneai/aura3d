#!/usr/bin/env node
// bench505 physics probes. Drives the BUILT dist of each run (served by score-local.mjs serve) in one headless Chrome on a loopback CDP
// port (raw CDP, Runtime.evaluate, no Playwright) and records window.__TASK_STATE__ trajectories, frame pixels and button behaviour.
//   node tools/agent-eval/probe-physics.mjs <batch> [--only runId,runId]     -> <evidence>/<batch>/physics-probes.json + physics-frames/<id>-<tag>.png
// Prerequisite: score-local.mjs build + serve for the batch (ports.json in the work dir).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const WORK = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";
const EVID = join(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval");
const [batch, ...rest] = process.argv.slice(2);
const only = rest.includes("--only") ? rest[rest.indexOf("--only") + 1].split(",") : null;
const PORT = Number(process.env.PROBE_CDP_PORT ?? 9377);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ports = JSON.parse(readFileSync(join(WORK, batch, "ports.json"), "utf8"));
const framesDir = join(EVID, batch, "physics-frames");
mkdirSync(framesDir, { recursive: true });

const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/b505-probe-chrome-${batch}`, "--headless=new", "--no-first-run", "--window-size=700,500", "about:blank"], { stdio: "ignore" });
const stop = () => chrome.kill("SIGKILL");
process.on("exit", stop);
for (let i = 0; i < 60; i += 1) {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`);
    break;
  } catch {
    await sleep(500);
  }
}

async function openPage(url) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => ((ws.onopen = ok), (ws.onerror = bad)));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
    else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(`console.error ${(msg.params.args ?? []).map((a) => a.value ?? a.description).join(" ")}`.slice(0, 200));
  };
  const send = (method, params = {}) => new Promise((ok) => ((id += 1), pending.set(id, ok), ws.send(JSON.stringify({ id, method, params }))));
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  await send("Page.navigate", { url });
  const shot = async (tag, runId) => {
    const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 640, height: 360, scale: 1 } });
    writeFileSync(join(framesDir, `${runId}-${tag}.png`), Buffer.from(r.result.data, "base64"));
  };
  const close = async () => {
    try {
      ws.close();
      await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
    } catch {}
  };
  return { evalJs, shot, close, errors };
}

const STATE = "JSON.stringify(window.__TASK_STATE__ ?? null)";
const CLICK = (label) => `(() => { const b=[...document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],a')].find(e=>((e.innerText||e.value||e.textContent||'').trim().toLowerCase())===${JSON.stringify(label.toLowerCase())}); if(!b) return false; b.click(); return true; })()`;

async function state(p) {
  try {
    return JSON.parse((await p.evalJs(STATE)) ?? "null");
  } catch {
    return null;
  }
}

async function poll(p, { everyMs, maxMs, until }) {
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await state(p);
    samples.push({ t: Date.now() - t0, s });
    if (s && until(s)) break;
    await sleep(everyMs);
  }
  return samples;
}

/** Sample state until done and take screenshots at the given seconds after the click. */
async function run(p, runId, { maxMs, everyMs, shotsAt, done }) {
  const tClick = Date.now();
  const samples = [];
  let tagged = 0;
  while (Date.now() - tClick < maxMs) {
    const s = await state(p);
    samples.push({ t: Date.now() - tClick, s });
    const next = shotsAt[tagged];
    if (next && (Date.now() - tClick) / 1000 >= next[0]) {
      await p.shot(next[1], runId);
      tagged += 1;
    }
    if (s && done(s) && tagged >= shotsAt.length) break;
    await sleep(everyMs);
  }
  return samples;
}

const monotonic = (xs) => xs.every((v, i) => i === 0 || v >= xs[i - 1]);
const shape = (v) => JSON.stringify(v);

async function probeTask(task, p, runId) {
  const out = { task };
  const s0 = await state(p);
  out.initial = s0;
  out.hasState = s0 != null;
  await p.shot("0", runId);
  if (task === 10) {
    out.clickedRelease = await p.evalJs(CLICK("Release"));
    const samples = await run(p, runId, { maxMs: 25000, everyMs: 400, shotsAt: [[0.4, "1"], [3.4, "2"], [10.4, "3"]], done: (s) => s.phase === "settled" });
    out.samples = samples.map((x) => ({ t: x.t, phase: x.s?.phase, toppled: x.s?.toppled, released: x.s?.ballReleased }));
    const seq = samples.map((x) => x.s?.toppled).filter((v) => typeof v === "number");
    out.monotonic = monotonic(seq);
    out.maxToppled = Math.max(0, ...seq);
    out.finalState = samples.at(-1)?.s ?? null;
    out.totalIs30 = s0?.total === 30;
    out.reachedSettled = samples.some((x) => x.s?.phase === "settled");
    out.success = out.maxToppled >= 27 && out.reachedSettled && out.monotonic;
    out.clickedReset = await p.evalJs(CLICK("Reset"));
    await sleep(800);
    out.afterReset = await state(p);
    out.resetOk = out.afterReset?.toppled === 0 && out.afterReset?.phase === "ready";
    await p.evalJs(CLICK("Release"));
    const second = await poll(p, { everyMs: 500, maxMs: 25000, until: (s) => s.phase === "settled" && s.toppled >= 27 });
    out.secondMax = Math.max(0, ...second.map((x) => x.s?.toppled ?? 0));
    out.secondOk = out.secondMax >= 27;
  }
  if (task === 11) {
    await sleep(3000);
    out.idle3s = await state(p);
    out.stableAtRest = out.idle3s?.displaced === 0;
    out.clickedSwing = await p.evalJs(CLICK("Swing"));
    const samples = await run(p, runId, { maxMs: 16000, everyMs: 250, shotsAt: [[0.5, "1"], [2, "2"], [8, "3"]], done: (s) => s.phase === "settled" });
    out.samples = samples.map((x) => ({ t: x.t, phase: x.s?.phase, displaced: x.s?.displaced, angle: x.s?.ballAngleDeg }));
    const angles = samples.map((x) => x.s?.ballAngleDeg).filter((v) => typeof v === "number");
    out.startAngleAbs = angles.length ? Math.abs(angles[0]) : null;
    out.maxAngleAbs = Math.max(0, ...angles.map(Math.abs));
    out.maxDisplaced = Math.max(0, ...samples.map((x) => x.s?.displaced ?? 0));
    out.cratesField = s0?.crates;
    out.reachedSettled = samples.some((x) => x.s?.phase === "settled");
    out.success = out.stableAtRest && out.maxDisplaced >= 5 && out.reachedSettled && out.maxAngleAbs >= 50;
    out.clickedReset = await p.evalJs(CLICK("Reset"));
    await sleep(800);
    out.afterReset = await state(p);
    out.resetOk = out.afterReset?.displaced === 0 && out.afterReset?.phase === "ready";
  }
  if (task === 12) {
    out.clickedDrop = await p.evalJs(CLICK("Drop 20 Balls"));
    const samples = await run(p, runId, { maxMs: 50000, everyMs: 500, shotsAt: [[1, "1"], [3, "2"], [12, "3"]], done: (s) => s.phase === "settled" && s.total === 20 });
    out.samples = samples.map((x) => ({ t: x.t, phase: x.s?.phase, spawned: x.s?.spawned, total: x.s?.total, bins: x.s?.bins }));
    const fin = samples.at(-1)?.s ?? null;
    out.finalState = fin;
    out.binsFirst = fin?.bins ?? null;
    const sum = Array.isArray(fin?.bins) ? fin.bins.reduce((a, b) => a + b, 0) : null;
    out.nonEmptyBins = Array.isArray(fin?.bins) ? fin.bins.filter((b) => b > 0).length : null;
    out.success = fin?.spawned === 20 && fin?.total === 20 && sum === 20 && fin?.phase === "settled" && out.nonEmptyBins >= 3 && fin.bins.length === 7;
    out.clickedReset = await p.evalJs(CLICK("Reset"));
    await sleep(800);
    out.afterReset = await state(p);
    out.resetOk = out.afterReset?.total === 0 && out.afterReset?.phase === "ready" && Array.isArray(out.afterReset?.bins) && out.afterReset.bins.every((b) => b === 0);
    await p.evalJs(CLICK("Drop 20 Balls"));
    const second = await poll(p, { everyMs: 500, maxMs: 50000, until: (s) => s.phase === "settled" && s.total === 20 });
    out.binsSecond = second.at(-1)?.s?.bins ?? null;
    out.repeatable = shape(out.binsSecond) === shape(out.binsFirst);
  }
  return out;
}

const taskOf = (id) => Number(/-t(\d+)-/.exec(id)[1]);
const results = existsSync(join(EVID, batch, "physics-probes.json")) ? JSON.parse(readFileSync(join(EVID, batch, "physics-probes.json"), "utf8")) : {};
for (const [runId, port] of Object.entries(ports)) {
  if (only && !only.includes(runId)) continue;
  const task = taskOf(runId);
  if (![10, 11, 12].includes(task)) continue;
  const p = await openPage(`http://127.0.0.1:${port}/`);
  let ready = false;
  for (let i = 0; i < 40 && !ready; i += 1) {
    ready = (await p.evalJs("window.__EVAL_READY__ === true")) === true;
    if (!ready) await sleep(500);
  }
  const rec = { ready };
  try {
    if (ready) Object.assign(rec, await probeTask(task, p, runId));
    else await p.shot("0", runId);
  } catch (error) {
    rec.probeError = String(error.message).slice(0, 200);
  }
  rec.pageErrors = p.errors.slice(0, 5);
  results[runId] = rec;
  console.log(runId, "ready", ready, "success", rec.success ?? null, "errors", rec.pageErrors.length);
  writeFileSync(join(EVID, batch, "physics-probes.json"), JSON.stringify(results, null, 1));
  await p.close();
}
stop();
process.exit(0);
