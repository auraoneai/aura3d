#!/usr/bin/env node
/* g2 probe v2: mount-aware real-input play for the 4 g2 games. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:5199";
const args = process.argv.slice(2);
const out = args[args.indexOf("--out") + 1] || "/tmp/g2-evidence";
const only = (args[args.indexOf("--games") + 1] || "turbo,skyline,courier,patrol").split(",");
const MOUNT_TIMEOUT = 360_000;
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

const GAMES = {
  turbo: {
    id: "showcase-turbo-drift-circuit", route: "/apps/showcase-turbo-drift-circuit/", evidence: "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__",
    steps: [
      { label: "02-gameplay", keys: [{ hold: "KeyW", duration: 2200 }, { wait: 400 }] },
      { label: "03-action", keys: [{ hold: "KeyW", duration: 700 }, { hold: "KeyD", duration: 1400 }, { wait: 500 }] },
      { label: "04-mid-progression", keys: [{ hold: "KeyW", duration: 2600 }, { press: "Space" }, { hold: "KeyA", duration: 1000 }, { wait: 600 }] },
    ],
    extended: { total: 42000, tick: async (page, i) => {
      await page.keyboard.down("KeyW"); await page.waitForTimeout(2600); await page.keyboard.up("KeyW");
      const k = i % 2 ? "KeyA" : "KeyD"; await page.keyboard.down(k); await page.waitForTimeout(700); await page.keyboard.up(k);
      if (i % 3 === 2) await page.keyboard.press("Space");
    }},
    fail: [{ hold: "KeyW", duration: 2500 }, { hold: "KeyD", duration: 2000 }, { wait: 900 }],
    reset: [{ press: "KeyR" }, { wait: 1500 }],
    mobileKeys: [{ press: "Space" }, { wait: 1500 }],
  },
  skyline: {
    id: "showcase-skyline-runner", route: "/apps/showcase-skyline-runner/", evidence: "__AURA3D_SHOWCASE_SKYLINE_RUNNER__",
    steps: [
      { label: "02-gameplay", keys: [{ hold: "KeyD", duration: 1800 }, { wait: 300 }] },
      { label: "03-action", keys: [{ hold: "KeyD", duration: 600 }, { press: "Space" }, { wait: 700 }, { press: "Space" }, { wait: 800 }] },
      { label: "04-mid-progression", keys: [{ hold: "KeyD", duration: 2400 }, { press: "Space" }, { wait: 600 }, { press: "KeyJ" }, { wait: 900 }] },
    ],
    extended: { total: 42000, tick: async (page) => {
      await page.keyboard.down("KeyD"); await page.waitForTimeout(1500); await page.keyboard.up("KeyD");
      await page.keyboard.press("Space"); await page.waitForTimeout(600);
    }},
    fail: [{ hold: "KeyD", duration: 4500 }, { wait: 1200 }],
    reset: [{ press: "KeyR" }, { wait: 1500 }],
    mobileKeys: [{ press: "Space" }, { wait: 1500 }],
  },
  courier: {
    id: "showcase-courier-rush", route: "/apps/showcase-courier-rush/", evidence: "__AURA3D_SHOWCASE_COURIER_RUSH__",
    steps: [
      { label: "02-gameplay", keys: [{ hold: "KeyW", duration: 1800 }, { wait: 400 }] },
      { label: "03-action", keys: [{ hold: "KeyD", duration: 1200 }, { hold: "KeyW", duration: 1000 }, { wait: 700 }] },
      { label: "04-mid-progression", keys: [{ hold: "KeyW", duration: 2000 }, { press: "Space" }, { wait: 1100 }] },
    ],
    extended: { total: 42000, tick: async (page, i) => {
      await page.keyboard.down("KeyW"); await page.waitForTimeout(2400); await page.keyboard.up("KeyW");
      const k = i % 2 ? "KeyA" : "KeyD"; await page.keyboard.down(k); await page.waitForTimeout(900); await page.keyboard.up(k);
      if (i % 4 === 3) await page.keyboard.press("Space");
    }},
    fail: [{ hold: "KeyW", duration: 2500 }, { hold: "KeyA", duration: 1800 }, { wait: 900 }],
    reset: [{ press: "KeyR" }, { wait: 1500 }],
    mobileKeys: [{ press: "Space" }, { wait: 1500 }],
  },
  patrol: {
    id: "showcase-patrol-wing", route: "/apps/showcase-patrol-wing/", evidence: "__AURA3D_SHOWCASE_PATROL_WING__",
    steps: [
      { label: "02-gameplay", keys: [{ hold: "KeyW", duration: 1700 }, { wait: 500 }] },
      { label: "03-action", keys: [{ hold: "KeyA", duration: 1400 }, { press: "Space" }, { wait: 1100 }] },
      { label: "04-mid-progression", keys: [{ hold: "KeyD", duration: 1600 }, { press: "KeyE" }, { wait: 1300 }] },
    ],
    extended: { total: 42000, tick: async (page, i) => {
      await page.keyboard.down("KeyW"); await page.waitForTimeout(2200); await page.keyboard.up("KeyW");
      const k = i % 2 ? "KeyA" : "KeyD"; await page.keyboard.down(k); await page.waitForTimeout(800); await page.keyboard.up(k);
      await page.keyboard.press("Space"); await page.waitForTimeout(400);
    }},
    fail: [{ hold: "KeyW", duration: 2200 }, { press: "KeyQ" }, { wait: 1500 }],
    reset: [{ press: "KeyR" }, { wait: 1500 }],
    mobileKeys: [{ press: "Space" }, { wait: 1500 }],
  },
};

async function runKeys(page, keys) {
  for (const k of keys) {
    if (k.wait) await page.waitForTimeout(k.wait);
    else if (k.press) await page.keyboard.press(k.press);
    else if (k.hold) { await page.keyboard.down(k.hold); await page.waitForTimeout(k.duration ?? 500); await page.keyboard.up(k.hold); }
  }
}

async function readState(page, evidenceName) {
  try {
    return await page.evaluate((evName) => {
      const hud = (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 300);
      const canvas = document.querySelector("canvas");
      let luma = null, colors = null;
      if (canvas) {
        try {
          const c2 = document.createElement("canvas"); c2.width = 64; c2.height = 64;
          const ctx = c2.getContext("2d"); ctx.drawImage(canvas, 0, 0, 64, 64);
          const d = ctx.getImageData(0, 0, 64, 64).data;
          let sum = 0; const uniq = new Set();
          for (let i = 0; i < d.length; i += 4) { sum += (d[i] + d[i+1] + d[i+2]) / 3; uniq.add(`${d[i]>>4},${d[i+1]>>4},${d[i+2]>>4}`); }
          luma = +(sum / (d.length / 4)).toFixed(1); colors = uniq.size;
        } catch {}
      }
      const ev = window[evName] ?? null;
      const diag = ev?.diagnostics ?? null;
      return {
        hud, canvas: canvas ? `${canvas.width}x${canvas.height}` : null, luma, colors,
        frameCount: ev?.frameCount ?? null,
        mounted: diag?.renderer?.runtime?.mounted ?? null,
        drawCalls: diag?.drawCalls ?? null,
        backend: diag?.backend ?? null,
        assetStates: Array.isArray(diag?.assets) ? diag.assets.map((a) => `${a.id ?? "?"}:${a.status ?? "?"}`) : null,
        gameplay: ev?.gameplay ? JSON.stringify(ev.gameplay).slice(0, 400) : null,
      };
    }, evidenceName);
  } catch (e) { return { error: String(e).slice(0, 200) }; }
}

async function waitForMount(page, evidenceName) {
  const t0 = Date.now();
  let last = null, n = 0;
  while (Date.now() - t0 < MOUNT_TIMEOUT) {
    last = await readState(page, evidenceName);
    const ready = last.mounted === true && (last.drawCalls ?? 0) > 0 && (last.luma ?? 0) > 4
      && (!last.assetStates || last.assetStates.every((s) => s.endsWith(":ready")));
    if (ready) return { ok: true, ms: Date.now() - t0, last };
    if ((last.frameCount ?? 0) > 60 && (last.luma ?? 0) > 4 && (last.colors ?? 0) > 8) {
      return { ok: true, ms: Date.now() - t0, last, fallback: true };
    }
    if (++n % 4 === 0) log(`    mount poll ${Math.round((Date.now() - t0) / 1000)}s frames=${last.frameCount} drawCalls=${last.drawCalls} luma=${last.luma} mounted=${last.mounted}`);
    await page.waitForTimeout(3000);
  }
  return { ok: false, ms: Date.now() - t0, last };
}

async function measureFps(page, ms = 2500) {
  try {
    return await page.evaluate((d) => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const loop = () => { n++; if (performance.now() - t0 < d) requestAnimationFrame(loop); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); };
      requestAnimationFrame(loop);
    }), ms);
  } catch { return null; }
}

async function probeGame(browser, key) {
  const g = GAMES[key];
  const dir = resolve(out, key); mkdirSync(dir, { recursive: true });
  const result = { id: g.id, key, route: g.route, steps: [], consoleErrors: [], pageErrors: [], requestFailures: [], warnings: 0 };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") result.consoleErrors.push(m.text().slice(0, 300)); else if (m.type() === "warning") result.warnings++; });
  page.on("pageerror", (e) => result.pageErrors.push(String(e?.message ?? e).slice(0, 300)));
  page.on("requestfailed", (r) => result.requestFailures.push({ url: r.url().slice(0, 160), failure: r.failure()?.errorText ?? "" }));
  page.on("response", (r) => { if (r.status() >= 400) result.requestFailures.push({ url: r.url().slice(0, 160), failure: `HTTP ${r.status()}` }); });

  const shot = async (label) => {
    const t = Date.now();
    const p = resolve(dir, `${label}.png`);
    try { await page.screenshot({ path: p }); } catch (e) { result.steps.push({ label, error: String(e).slice(0, 120) }); return; }
    const st = await readState(page, g.evidence);
    result.steps.push({ label, file: p, ms: Date.now() - t, state: st });
    log(`  [${key}] ${label} shot in ${Math.round((Date.now() - t) / 1000)}s luma=${st.luma} colors=${st.colors} frames=${st.frameCount}`);
  };

  const t0 = Date.now();
  try {
    await page.goto(BASE + g.route, { waitUntil: "load", timeout: 90000 });
    log(`  [${key}] loaded in ${Date.now() - t0}ms, waiting for mount...`);
  } catch (e) { result.loadError = String(e).slice(0, 200); log(`  [${key}] LOAD ERROR ${result.loadError}`); }

  const mount = await waitForMount(page, g.evidence);
  result.mount = { ok: mount.ok, ms: mount.ms, fallback: !!mount.fallback, last: mount.last };
  log(`  [${key}] mount ${mount.ok ? "OK" : "TIMEOUT"} in ${Math.round(mount.ms / 1000)}s (frames=${mount.last?.frameCount} drawCalls=${mount.last?.drawCalls} luma=${mount.last?.luma})`);
  await page.waitForTimeout(2000);

  await shot("01-first-load");
  result.fpsEarly = await measureFps(page);
  log(`  [${key}] fpsEarly=${result.fpsEarly}`);

  for (const s of g.steps) { await runKeys(page, s.keys); await shot(s.label); }

  await runKeys(page, g.fail); await shot("05-impact-or-collision");
  await shot("06-fail-or-ko");

  const extStart = Date.now(); let i = 0;
  while (Date.now() - extStart < g.extended.total) {
    await g.extended.tick(page, i++);
    if (i === 4) await shot("04b-extended");
    if (i === 9) await shot("04c-extended");
  }
  await shot("04-mid-extended-end");
  result.fpsLate = await measureFps(page);
  log(`  [${key}] fpsLate=${result.fpsLate} extendedTicks=${i}`);

  await shot("08-win-or-completion");
  await runKeys(page, g.reset); await shot("07-reset");

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on("pageerror", (e) => result.pageErrors.push("mobile:" + String(e?.message ?? e).slice(0, 200)));
  mp.on("console", (m) => { if (m.type() === "error") result.consoleErrors.push("mobile:" + m.text().slice(0, 200)); });
  try {
    await mp.goto(BASE + g.route, { waitUntil: "load", timeout: 90000 });
    await mp.waitForTimeout(6000);
    await runKeys(mp, g.mobileKeys);
    try { await mp.touchscreen.tap(195, 400); } catch {}
    await mp.waitForTimeout(1500);
    const mp2 = resolve(dir, "09-mobile.png");
    await mp.screenshot({ path: mp2 });
    result.steps.push({ label: "09-mobile", file: mp2, state: await readState(mp, g.evidence) });
    log(`  [${key}] 09-mobile captured`);
  } catch (e) { result.steps.push({ label: "09-mobile", error: String(e).slice(0, 120) }); }
  await mctx.close();

  result.verdict = {
    booted: mount.ok,
    zeroConsoleErrors: result.consoleErrors.length === 0,
    zeroPageErrors: result.pageErrors.length === 0,
    zeroNetFailures: result.requestFailures.length === 0,
  };
  writeFileSync(resolve(dir, "probe.json"), JSON.stringify(result, null, 2));
  await ctx.close();
  return result;
}

const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--autoplay-policy=no-user-gesture-required"] });
const summary = {};
for (const key of only) {
  if (!GAMES[key]) continue;
  log(`probing ${key} ...`);
  try {
    const r = await probeGame(browser, key);
    summary[key] = { mount: r.mount?.ok, ms: r.mount?.ms, fps: [r.fpsEarly, r.fpsLate], consoleErr: r.consoleErrors.length, pageErr: r.pageErrors.length, net: r.requestFailures.length };
    log(`done ${key}: ${JSON.stringify(summary[key])}`);
  } catch (e) { summary[key] = { fatal: String(e).slice(0, 200) }; log(`FATAL ${key}: ${summary[key].fatal}`); }
}
await browser.close();
writeFileSync(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
log("SUMMARY " + JSON.stringify(summary));
