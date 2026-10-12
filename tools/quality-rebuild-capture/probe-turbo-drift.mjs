#!/usr/bin/env node
/**
 * Turbo Drift gameplay probe (headless, GPU runner). Loads the route per arm,
 * samples the game's own evidence every 100 ms through a fixed input script and
 * writes <out>/probe-turbo-drift.json plus a per-phase summary on stdout.
 *
 *   PROBE_ORIGIN   built-site origin (default: build + serve locally)
 *   PROBE_ARMS     ';'-separated arms: `default` (no a3d-qr), `none`, a flag list,
 *                  `prod` (https://aura3d.auraone.ai), optionally `<arm>@synthetic`
 *   QRC_GPU_ARGS   chromium args
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, "../..");
const outDir = path.resolve(repoRoot, process.env.PROBE_OUT ?? "tools/quality-rebuild-capture/out");
const buildRoot = path.join(toolDir, ".build");
const GAME = "showcase-turbo-drift-circuit";
const ROUTE = `/apps/${GAME}/`;
const PROD = process.env.PROBE_PROD_ORIGIN ?? "https://aura3d.auraone.ai";
const DEFAULTS = "core,lighting,camera,materials,assets,animation,post,vfx";
const defaultArms = ["default", "none", DEFAULTS, ...DEFAULTS.split(",").map((f) => `-${f}`), "default@synthetic", "prod", "prod@synthetic"];
const arms = (process.env.PROBE_ARMS || defaultArms.join(";")).split(";").map((s) => s.trim()).filter(Boolean);
const phases = [
  { name: "idle", ms: 3000, keys: [] },
  { name: "W", ms: 3000, keys: ["KeyW"] },
  { name: "W+D", ms: 2000, keys: ["KeyW", "KeyD"] },
  { name: "W+A", ms: 2000, keys: ["KeyW", "KeyA"] },
  { name: "release", ms: 1500, keys: [] }
];

function serve(siteRoot) {
  const roots = [siteRoot, path.join(repoRoot, "public"), path.join(repoRoot, "marketing", "public")];
  const tryFile = (root, rel) => {
    const full = path.resolve(root, `.${rel}`);
    if (!full.startsWith(path.resolve(root))) return null;
    try {
      const st = statSync(full);
      if (st.isFile()) return full;
      if (st.isDirectory() && existsSync(path.join(full, "index.html"))) return path.join(full, "index.html");
    } catch { /* missing */ }
    return null;
  };
  const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ktx2": "image/ktx2", ".svg": "image/svg+xml" };
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const appRel = /^\/apps\/[^/]+(\/.*)$/.exec(pathname)?.[1];
    const file = roots.map((r) => tryFile(r, pathname) ?? (appRel ? tryFile(r, appRel) : null)).find(Boolean);
    if (!file) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": mime[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

// Runs in the page: one sample of the game's own state.
const SAMPLE = () => {
  const ev = window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__;
  const v2 = window.__AURA3D_GAME_EVIDENCE__?.["showcase-turbo-drift-circuit"];
  const subj = window.__AURA3D_COMPOSITION_PROBE__?.subject;
  const r = (n) => (typeof n === "number" ? Math.round(n * 10000) / 10000 : n);
  const arr = (a) => (a ? Array.from(a, r) : null);
  const ch = ev?.vehicleChassis;
  return {
    t: Math.round(performance.now()),
    frame: window.__AURA3D_GAME__?.frame ?? null,
    speed: r(ev?.speed),
    race: ev?.raceState ? { x: ev.raceState.x, z: ev.raceState.z, heading: ev.raceState.heading, progress: ev.raceState.progress, onRoad: ev.raceState.roadAlignment?.onRoad, offset: ev.raceState.roadAlignment?.signedTrackOffset } : null,
    chassis: ch ? { x: ch.position?.x, z: ch.position?.z, heading: ch.heading, grounded: ch.grounded, wheels: ch.groundedWheels, gap: ch.maxContactGap, pitch: ch.pitch, roll: ch.roll, steer: ch.steerAngle, per: (ch.wheels ?? []).map((w) => `${w.id}:${w.grounded ? 1 : 0}:${w.contactGap}:${w.compression}`).join(" ") } : null,
    road: ev?.raceState?.roadAlignment ? JSON.stringify(ev.raceState.roadAlignment).slice(0, 300) : null,
    node: subj ? { p: arr(subj.position), r: arr(subj.rotation) } : null,
    lights: ev?.raceSession?.startLights ?? ev?.startLights ?? null,
    hudTrack: document.getElementById("track-state-value")?.textContent ?? null,
    v2: v2 ? JSON.stringify(v2).slice(0, 400) : null
  };
};

async function press(page, mode, code, down) {
  if (mode === "synthetic") {
    await page.evaluate(([c, d]) => {
      const key = c.startsWith("Key") ? c.slice(3).toLowerCase() : c;
      const e = new KeyboardEvent(d ? "keydown" : "keyup", { code: c, key, bubbles: true, cancelable: true });
      (document.querySelector("canvas") ?? document.body).dispatchEvent(e);
    }, [code, down]);
  } else if (down) await page.keyboard.down(code.startsWith("Key") ? code.slice(3).toLowerCase() : code);
  else await page.keyboard.up(code.startsWith("Key") ? code.slice(3).toLowerCase() : code);
}

function summarize(samples) {
  const s = samples.filter((x) => x.chassis || x.race);
  if (!s.length) return { samples: samples.length, noState: true };
  const a = s[0], b = s[s.length - 1];
  const pos = (x) => x.chassis ?? x.race;
  const dist = Math.hypot((pos(b).x ?? 0) - (pos(a).x ?? 0), (pos(b).z ?? 0) - (pos(a).z ?? 0));
  return {
    samples: s.length,
    frames: [a.frame, b.frame],
    from: { x: pos(a).x, z: pos(a).z, h: pos(a).heading }, to: { x: pos(b).x, z: pos(b).z, h: pos(b).heading },
    dist: Math.round(dist * 1000) / 1000,
    raceHeadingDelta: a.race && b.race ? Math.round((b.race.heading - a.race.heading) * 1000) / 1000 : null,
    speed: [a.speed, b.speed, Math.max(...s.map((x) => Math.abs(x.speed ?? 0)))],
    minWheels: Math.min(...s.map((x) => x.chassis?.wheels ?? 4)),
    maxGap: Math.max(...s.map((x) => x.chassis?.gap ?? 0)),
    nodeY: [a.node?.p?.[1], b.node?.p?.[1]], nodeRot: [a.node?.r, b.node?.r],
    offTrackHud: s.filter((x) => x.hudTrack === "Off track").length,
    lights: b.lights
  };
}

async function runArm(browser, origin, arm) {
  const [base, mode = "cdp"] = arm.split("@");
  const isProd = base === "prod";
  const qs = base === "default" || isProd ? "" : `?a3d-qr=${encodeURIComponent(base)}`;
  const url = `${isProd ? PROD : origin}${ROUTE}${qs}`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  const result = { arm, url, mode, phases: {}, errors };
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__ || window.__AURA3D_GAME_EVIDENCE__), null, { timeout: 120_000 });
    await page.waitForTimeout(2500);
    await page.mouse.click(640, 360).catch(() => {});
    for (const phase of phases) {
      for (const k of phase.keys) await press(page, mode, k, true);
      const samples = [];
      const end = Date.now() + phase.ms;
      while (Date.now() < end) { samples.push(await page.evaluate(SAMPLE)); await page.waitForTimeout(100); }
      for (const k of phase.keys) await press(page, mode, k, false);
      result.phases[phase.name] = { summary: summarize(samples), samples };
      await page.screenshot({ path: path.join(outDir, `probe-${arm.replace(/[^A-Za-z0-9_-]/g, "_")}-${phase.name}.png`) }).catch(() => {});
    }
  } catch (e) { result.failure = String(e?.message ?? e).slice(0, 500); }
  await page.close();
  return result;
}

mkdirSync(outDir, { recursive: true });
let origin = process.env.PROBE_ORIGIN;
let server;
if (!origin && arms.some((a) => !a.startsWith("prod"))) {
  if (!process.env.PROBE_SKIP_BUILD) {
    const b = spawnSync(process.execPath, [path.join(toolDir, "capture-games.mjs"), "--build-only", "--games", GAME], { stdio: "inherit", env: { ...process.env, QRC_LOCAL_BUILD: "true" } });
    if (b.status !== 0) { console.error("build failed"); process.exit(1); }
  }
  ({ server, origin } = await serve(path.join(buildRoot, "site")));
}
const args = (process.env.QRC_GPU_ARGS ?? "").split(/\s+/).filter(Boolean);
const browser = await chromium.launch({ headless: true, args });
const report = [];
for (const arm of arms) {
  const r = await runArm(browser, origin, arm);
  report.push(r);
  writeFileSync(path.join(outDir, "probe-turbo-drift.json"), JSON.stringify(report, null, 1));
  console.log(`\n=== ${arm} (${r.url}) ${r.failure ? `FAILED: ${r.failure}` : ""}`);
  for (const [name, p] of Object.entries(r.phases)) console.log(`  ${name}: ${JSON.stringify(p.summary)}`);
  if (r.errors.length) console.log(`  errors: ${JSON.stringify(r.errors.slice(0, 5))}`);
}
await browser.close();
server?.close();
