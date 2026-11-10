// Cloud replacement for the local headless-Chrome census (census.mjs).
// Runs INSIDE the capture image on a serverless ACR task; never run it on the Mac.
//
//   node capture-runner.mjs                 container mode: config in CAPTURE_CONFIG_B64
//   node capture-runner.mjs --collect <log> <outdir>   local mode: decode a task log (no browser)
//
// Container mode visits <base>/apps/<slug>/ for each slug, waits, and emits per-slug
// <slug>.json + <slug>.png (the census.mjs fields) on stdout as framed base64 blocks,
// which `--collect` turns back into files. An optional `script` drives key/mouse input
// and samples a coarse pixel grid of the world canvas to flag solid-colour frames.
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";

const TAG = "@@A3DCAP";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- collect (local)
if (process.argv[2] === "--collect") {
  const [log, outdir] = process.argv.slice(3);
  mkdirSync(outdir, { recursive: true });
  const open = new Map();
  const done = [];
  for (const raw of readFileSync(log, "utf8").split(/\r?\n/)) {
    const i = raw.indexOf(TAG + " ");
    if (i < 0) continue;
    const [kind, ...rest] = raw.slice(i + TAG.length + 1).trim().split(" ");
    if (kind === "BEGIN") open.set(rest[0], []);
    else if (kind === "D") open.get(rest[0])?.push(rest[1]);
    else if (kind === "END") {
      const parts = open.get(rest[0]);
      if (!parts) continue;
      const buf = Buffer.from(parts.join(""), "base64");
      const ok = createHash("sha256").update(buf).digest("hex") === rest[1];
      if (!ok) { console.error(`CORRUPT ${rest[0]}`); continue; }
      writeFileSync(`${outdir}/${rest[0]}`, buf);
      done.push(rest[0]);
      open.delete(rest[0]);
    }
  }
  for (const name of open.keys()) console.error(`INCOMPLETE ${name}`);
  console.log(`collected ${done.length} files into ${outdir}`);
  process.exit(open.size ? 3 : 0);
}

// ---------------------------------------------------------------- container mode
const { chromium } = await import("playwright");
const cfg = JSON.parse(Buffer.from(process.env.CAPTURE_CONFIG_B64 ?? "", "base64url").toString("utf8") || "{}");
const base = String(cfg.base ?? "").replace(/\/+$/, "");
const slugs = cfg.slugs ?? [];
const waitMs = Math.round((cfg.wait ?? 14) * 1000);
const backend = cfg.backend && cfg.backend !== "default" ? cfg.backend : null;
const readyMs = Math.round((cfg.readyTimeout ?? 90) * 1000);
const script = cfg.script ?? null;
const shardTag = cfg.shard ?? "0";

const write = (text) => new Promise((resolve) => process.stdout.write(text, () => resolve()));
async function emit(name, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === "string" ? data : JSON.stringify(data, null, 1));
  const b64 = buf.toString("base64");
  const out = [`${TAG} BEGIN ${name}`];
  for (let i = 0; i < b64.length; i += 3000) out.push(`${TAG} D ${name} ${b64.slice(i, i + 3000)}`);
  out.push(`${TAG} END ${name} ${createHash("sha256").update(buf).digest("hex")}`);
  await write(out.join("\n") + "\n");
}

// Flag presets. Software GL always: the ACR agent has no GPU. WebGPU goes through SwiftShader Vulkan.
const COMMON = ["--ignore-gpu-blocklist", "--disable-extensions", "--no-first-run", "--no-sandbox", "--disable-dev-shm-usage"];
const WEBGL_FLAGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const WEBGPU_FLAGS = [...WEBGL_FLAGS, "--enable-unsafe-webgpu", "--enable-features=Vulkan,UseSkiaRenderer", "--use-vulkan=swiftshader", "--use-webgpu-adapter=swiftshader", "--disable-vulkan-surface"];
const FLAG_SETS = {
  webgl: [...COMMON, ...WEBGL_FLAGS],
  webgpu: [...COMMON, ...WEBGPU_FLAGS],
};
const chromeArgs = cfg.chromeArgs?.length ? [...COMMON, ...cfg.chromeArgs] : backend === "webgpu" ? FLAG_SETS.webgpu : FLAG_SETS.webgl;

function launch(args = chromeArgs) {
  return chromium.launch({ channel: "chromium", headless: true, args });
}

// Expression copied from census.mjs so the fields are identical.
const STATE_EXPR = `JSON.stringify((()=>{const h=document.documentElement.innerHTML;const t=document.body?document.body.innerText:'';let gpu='';try{const g=document.createElement('canvas').getContext('webgl2');const e=g.getExtension('WEBGL_debug_renderer_info');gpu=e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):''}catch(x){gpu=String(x)}
return {url:location.href,history_length:history.length,nav_types:performance.getEntriesByType('navigation').map(n=>n.type),mount_failed:h.includes('RENDERER_MOUNT_FAILED'),safety_black_frame:h.includes('SAFETY_BLACK_FRAME'),failed_to_start_visible:/failed to start|could not start/i.test(t),canvases:document.querySelectorAll('canvas').length,ready:document.body&&document.body.dataset.aura3dReady,gpu}})())`;

const WEBGPU_PROBE_EXPR = `(async()=>{const r={present:'gpu' in navigator,secure:isSecureContext};try{if(r.present){const a=await navigator.gpu.requestAdapter();r.adapter=!!a;if(a){const i=a.info??(a.requestAdapterInfo?await a.requestAdapterInfo():{});r.info={vendor:i.vendor,architecture:i.architecture,device:i.device,description:i.description};r.features=[...a.features].slice(0,40);r.fallback=a.isFallbackAdapter;try{const d=await a.requestDevice();r.device=true;d.destroy()}catch(e){r.device=String(e).slice(0,200)}}}}catch(e){r.error=String(e).slice(0,300)}return r})()`;

// In-page sampler. Wraps requestAnimationFrame callbacks so the world canvas is read in the
// same task that drew it (a WebGL drawing buffer is cleared after present).
function samplerInit(s) {
  return `(() => {
  const cfg = ${JSON.stringify(s)};
  const [gw, gh] = cfg.grid;
  const S = (window.__a3dSamp = { on: false, phase: "idle", t0: 0, lastT: -1e9, n: 0, solid: 0, blank: 0, tsamp: [], grabs: [], err: null, target: null, solidT: [] });
  const scratch = document.createElement("canvas"); scratch.width = gw; scratch.height = gh;
  const sctx = scratch.getContext("2d", { willReadFrequently: true }); sctx.imageSmoothingEnabled = false;
  function pick() {
    if (cfg.selector) return document.querySelector(cfg.selector);
    if (S.target && S.target.isConnected && S.target.width) return S.target;
    let best = null, ba = 0;
    for (const c of document.querySelectorAll("canvas")) { const a = c.width * c.height; if (a > ba) { ba = a; best = c; } }
    return (S.target = best);
  }
  function grab(c, why, t) {
    if (S.grabs.length >= cfg.maxGrabs) return;
    try { const g = document.createElement("canvas"); g.width = c.width; g.height = c.height; g.getContext("2d").drawImage(c, 0, 0); S.grabs.push({ why, t, w: c.width, h: c.height, png: g.toDataURL("image/png").split(",")[1] }); } catch (e) { S.err = String(e); }
  }
  function sample() {
    if (!S.on) return;
    const now = performance.now();
    if (now - S.lastT < cfg.intervalMs) return;
    const c = pick(); if (!c || !c.width || !c.height) return;
    let d;
    try { sctx.drawImage(c, 0, 0, gw, gh); d = sctx.getImageData(0, 0, gw, gh).data; } catch (e) { S.err = String(e); return; }
    const n = gw * gh;
    let allZero = true;
    for (let i = 0; i < d.length; i++) if (d[i] !== 0) { allZero = false; break; }
    if (allZero) { S.blank++; return; } // cleared drawing buffer: retry on the next callback, never count as solid
    S.lastT = now;
    let bestCount = 0, bi = 0;
    for (let i = 0; i < n; i++) {
      let cnt = 0; const r = d[i*4], g = d[i*4+1], b = d[i*4+2];
      for (let j = 0; j < n; j++) if (Math.abs(d[j*4]-r) <= cfg.tolerance && Math.abs(d[j*4+1]-g) <= cfg.tolerance && Math.abs(d[j*4+2]-b) <= cfg.tolerance) cnt++;
      if (cnt > bestCount) { bestCount = cnt; bi = i; }
    }
    const frac = bestCount / n, t = now - S.t0;
    const isSolid = frac >= cfg.solidFraction;
    S.n++;
    S.tsamp.push([Math.round(t), +frac.toFixed(3), d[bi*4], d[bi*4+1], d[bi*4+2], S.phase === "baseline" ? 0 : S.phase === "script" ? 1 : 2]);
    if (S.n === 1) grab(c, "first-sample", t);
    if (isSolid) { S.solid++; S.solidT.push(Math.round(t)); if (S.solid <= cfg.maxGrabs - 1) grab(c, "solid", t); }
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => { try { return cb(ts); } finally { try { sample(); } catch (e) { S.err = String(e); } } });
})();`;
}

// CDP screenshot like census.mjs: page.screenshot() waits for fonts and times out when software GL saturates the CPU.
async function shotOf(cdp) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  return Buffer.from(r.data, "base64");
}

async function runStep(page, st, log, t0) {
  const stamp = () => Date.now() - t0;
  switch (st.op) {
    case "wait": await sleep(st.ms); break;
    case "down": log.push([stamp(), "down", st.key]); await page.keyboard.down(st.key); break;
    case "up": log.push([stamp(), "up", st.key]); await page.keyboard.up(st.key); break;
    case "press": log.push([stamp(), "press", st.key]); await page.keyboard.down(st.key); await sleep(st.hold ?? 60); await page.keyboard.up(st.key); break;
    case "click": log.push([stamp(), "click", `${st.x},${st.y}`]); await page.mouse.click(st.x, st.y); break;
    case "repeat": for (let i = 0; i < st.count; i++) for (const sub of st.steps) await runStep(page, sub, log, t0); break;
    default: throw new Error(`unknown script op ${st.op}`);
  }
}

async function runScript(page, cdp, slug, files) {
  const s = { intervalMs: 50, grid: [16, 9], solidFraction: 0.97, tolerance: 6, baselineMs: 2000, tailMs: 1500, maxGrabs: 4, ...(script.sample ?? {}) };
  const stepLog = [];
  await page.evaluate(() => { const S = window.__a3dSamp; S.on = true; S.phase = "baseline"; S.t0 = performance.now(); });
  const t0 = Date.now();
  let shotTaken = false, lastSolid = 0, stop = false;
  const watcher = (async () => {
    while (!stop) {
      await sleep(40);
      try {
        const n = await page.evaluate(() => window.__a3dSamp.solid);
        if (n > lastSolid && !shotTaken) { shotTaken = true; files.push([`${slug}.solid-first-page.png`, await shotOf(cdp)]); }
        lastSolid = n;
      } catch {}
    }
  })();
  try {
    await sleep(s.baselineMs);
    await page.evaluate(() => { window.__a3dSamp.phase = "script"; });
    for (const st of script.steps ?? []) await runStep(page, st, stepLog, t0);
    await page.evaluate(() => { window.__a3dSamp.phase = "tail"; });
    await sleep(s.tailMs);
  } finally { stop = true; await watcher; }
  const R = await page.evaluate(() => { const S = window.__a3dSamp; S.on = false; return { n: S.n, solid: S.solid, blank: S.blank, err: S.err, tsamp: S.tsamp, grabs: S.grabs, solidT: S.solidT }; });
  for (const g of R.grabs) if (g.why === "first-sample") files.push([`${slug}.canvas-first-sample.png`, Buffer.from(g.png, "base64")]);
  const solidGrabs = R.grabs.filter((g) => g.why === "solid");
  solidGrabs.forEach((g, i) => files.push([`${slug}.solid-${i}-canvas.png`, Buffer.from(g.png, "base64")]));
  // episodes: consecutive solid samples merged (gap <= 3 * interval)
  const episodes = [];
  for (const t of R.solidT) {
    const last = episodes[episodes.length - 1];
    if (last && t - last.end_ms <= s.intervalMs * 3) { last.end_ms = t; last.samples++; } else episodes.push({ start_ms: t, end_ms: t, samples: 1 });
  }
  const phaseCount = (p) => R.tsamp.filter((r) => r[5] === p).length;
  const phaseSolid = (p) => R.tsamp.filter((r) => r[5] === p && r[1] >= s.solidFraction).length;
  const solidSamples = R.tsamp.filter((r) => r[1] >= s.solidFraction);
  return {
    config: s,
    samples_total: R.n,
    readback_blank_retries: R.blank,
    sampler_error: R.err,
    solid_frame_count: R.solid,
    solid_frame_times_ms: R.solidT.slice(0, 400),
    solid_frame_colors: [...new Set(solidSamples.map((r) => `${r[2]},${r[3]},${r[4]}`))].slice(0, 20),
    solid_episodes: episodes,
    by_phase: { baseline: { samples: phaseCount(0), solid: phaseSolid(0) }, script: { samples: phaseCount(1), solid: phaseSolid(1) }, tail: { samples: phaseCount(2), solid: phaseSolid(2) } },
    first_solid_screenshots: { canvas: solidGrabs.length ? `${slug}.solid-0-canvas.png` : null, page: shotTaken ? `${slug}.solid-first-page.png` : null },
    steps_log: stepLog.slice(0, 600),
    steps_logged_total: stepLog.length,
    samples: R.tsamp, // [t_ms, modal_fraction, r, g, b, phase 0=baseline 1=script 2=tail]
  };
}

async function captureSlug(slug) {
  const qs = [backend ? `backend=${backend}` : "", cfg.query ?? ""].filter(Boolean).join("&");
  const url = `${base}/apps/${slug}/${qs ? `?${qs}` : ""}`;
  const files = [];
  const browser = await launch();
  const hard = setTimeout(() => { console.log(slug, "TIMEOUT"); process.exit(2); }, waitMs + readyMs + 120000 + (script ? 90000 : 0));
  try {
    const ctx = await browser.newContext({
      viewport: { width: script?.viewport?.width ?? 960, height: script?.viewport?.height ?? 540 },
      deviceScaleFactor: 1,
      reducedMotion: script?.reducedMotion === false ? "no-preference" : "reduce",
    });
    if (script) await ctx.addInitScript(samplerInit({ intervalMs: 50, grid: [16, 9], solidFraction: 0.97, tolerance: 6, maxGrabs: 4, ...(script.sample ?? {}) }));
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const events = [];
    let navs = 0;
    cdp.on("Runtime.consoleAPICalled", (p) => events.push({ kind: "console", level: p.type, text: p.args.map((a) => a.value ?? a.description).join(" ").slice(0, 600) }));
    cdp.on("Runtime.exceptionThrown", (p) => events.push({ kind: "page-error", level: "error", text: `${p.exceptionDetails.text} ${p.exceptionDetails.exception?.description?.slice(0, 500) ?? ""}` }));
    cdp.on("Log.entryAdded", (p) => events.push({ kind: "log", level: p.entry.level, text: `${p.entry.text.slice(0, 400)} ${p.entry.url ?? ""}` }));
    page.on("framenavigated", (f) => { if (f === page.mainFrame() && f.url().startsWith("http")) navs++; });
    await cdp.send("Runtime.enable"); await cdp.send("Log.enable"); await cdp.send("Page.enable");
    await page.goto(url, { waitUntil: "commit", timeout: 60000 }).catch((e) => events.push({ kind: "page-error", level: "error", text: `goto: ${String(e).slice(0, 300)}` }));
    await sleep(waitMs);
    // Software GL boots slower than a real GPU: after the fixed wait, poll for the ready flag (or a terminal
    // failure marker) up to readyTimeout so the census fields describe a booted page, not a loading screen.
    const tReady = Date.now();
    let state = JSON.parse(await page.evaluate(STATE_EXPR));
    while (state.ready !== "true" && !state.mount_failed && !state.safety_black_frame && !state.failed_to_start_visible && Date.now() - tReady < readyMs) {
      await sleep(500);
      state = JSON.parse(await page.evaluate(STATE_EXPR));
    }
    const readyExtraMs = Date.now() - tReady;
    files.push([`${slug}.png`, await shotOf(cdp)]);
    const navigator_gpu = await page.evaluate(WEBGPU_PROBE_EXPR).catch((e) => ({ error: String(e) }));
    const isErr = (e) => e.level === "error";
    const non404 = events.filter((e) => isErr(e) && !/\b404\b|Not Found/.test(e.text)).map((e) => e.text);
    const codes = [...new Set(events.flatMap((e) => e.text.match(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)*_(?:DEGRADED|PARTIAL|FAILED|FRAME|UNSUPPORTED)\b/g) ?? []))].sort();
    const res = { slug, ...state, frame_navigated: navs, reload_suspected: navs > 1 || state.history_length > 2 || state.nav_types.includes("reload"), codes, non404_errors: non404, events };
    // extras beyond census.mjs
    res.capture = { requested_url: url, backend: backend ?? "default", wait_s: waitMs / 1000, ready_extra_wait_ms: readyExtraMs, chromium: browser.version(), chrome_args: chromeArgs, shard: shardTag, navigator_gpu, cpus: os.cpus().length, mem_gb: +(os.totalmem() / 2 ** 30).toFixed(1) };
    if (script) {
      try { res.script_run = await runScript(page, cdp, slug, files); files.push([`${slug}.after.png`, await shotOf(cdp)]); }
      catch (e) { res.script_run = { error: String(e).slice(0, 500) }; }
    }
    // Console events logged during the script phase belong in the record too.
    res.events = events;
    res.non404_errors_final = events.filter((e) => isErr(e) && !/\b404\b|Not Found/.test(e.text)).map((e) => e.text);
    files.unshift([`${slug}.json`, JSON.stringify(res, null, 1)]);
    console.log(`${slug} hist ${state.history_length} nav ${navs} mf ${state.mount_failed} sbf ${state.safety_black_frame} fts ${state.failed_to_start_visible} errs ${non404.length} codes ${codes.join(",")} gpu ${String(state.gpu).slice(0, 60)}` +
      (res.script_run?.solid_frame_count !== undefined ? ` solid ${res.script_run.solid_frame_count}/${res.script_run.samples_total}` : ""));
  } catch (e) {
    files.unshift([`${slug}.json`, JSON.stringify({ slug, url, capture_error: String(e).slice(0, 800) }, null, 1)]);
    console.log(slug, "CAPTURE_ERROR", String(e).slice(0, 200));
  } finally {
    clearTimeout(hard);
    await browser.close().catch(() => {});
  }
  for (const [name, data] of files) await emit(name, data);
}

async function probe() {
  const out = {};
  const sets = cfg.flagSets ?? { webgl: FLAG_SETS.webgl, webgpu: FLAG_SETS.webgpu };
  for (const [name, args] of Object.entries(sets)) {
    const r = { args };
    try {
      const b = await launch(args);
      r.chromium = b.version();
      const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
      const page = await ctx.newPage();
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => (r.goto_error = String(e).slice(0, 200)));
      r.navigator_gpu = await page.evaluate(WEBGPU_PROBE_EXPR);
      r.webgl = await page.evaluate(() => { const o = {}; for (const k of ["webgl2", "webgl"]) { try { const g = document.createElement("canvas").getContext(k); if (!g) { o[k] = null; continue; } const e = g.getExtension("WEBGL_debug_renderer_info"); o[k] = { vendor: e ? g.getParameter(e.UNMASKED_VENDOR_WEBGL) : "", renderer: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "", maxTex: g.getParameter(g.MAX_TEXTURE_SIZE) }; } catch (x) { o[k] = String(x); } } return o; });
      const c2 = await ctx.newCDPSession(page);
      try { const si = await c2.send("SystemInfo.getInfo"); r.system_gpu = { devices: si.gpu.devices?.map((d) => ({ vendorString: d.vendorString, deviceString: d.deviceString, driverVendor: d.driverVendor })), auxAttributes: si.gpu.auxAttributes, featureStatus: si.gpu.featureStatus }; } catch (x) { r.system_gpu_error = String(x).slice(0, 200); }
      await b.close();
    } catch (e) { r.error = String(e).slice(0, 500); }
    out[name] = r;
  }
  await emit(`probe-${shardTag}.json`, out);
  console.log(JSON.stringify(out, null, 1).slice(0, 4000));
}

console.log(`capture-runner shard=${shardTag} base=${base} backend=${backend ?? "default"} wait=${waitMs / 1000}s slugs=${slugs.length} script=${script ? "yes" : "no"} mode=${cfg.mode ?? "capture"}`);
if (cfg.mode === "probe") await probe();
else for (const slug of slugs) await captureSlug(slug);
await write("capture-runner done\n");
process.exitCode = 0;
setTimeout(() => process.exit(0), 3000).unref();
