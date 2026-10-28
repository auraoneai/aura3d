import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Live (production URL) capture of the Teleoperator routes: console/page errors, failed responses, WebGL shader/link/GL errors,
 * draw calls, canvas pixel stats and a downsized frame printed into the log (remote runs cannot egress artifacts).
 * LIVE_BASE or tests/browser/live-base.txt overrides the origin.
 */
const BASE_FILE = "tests/browser/live-base.txt";
const BASE = (process.env.LIVE_BASE ?? (existsSync(BASE_FILE) ? readFileSync(BASE_FILE, "utf8").trim() : "https://aura3d.auraone.ai")).replace(/\/$/, "");
const ROUTES = ["/apps/showcase-teleoperator/"];
const BOOT_WAIT_MS = Number(process.env.LIVE_BOOT_WAIT_MS ?? 15000);
const TAG = process.env.TELEO_TAG ?? "live";

const GL_PROBE = `
(() => {
  const log = (window.__GLPROBE = { shaderFail: [], linkFail: [], glErrors: [], draws: 0, contexts: [], extensions: [], floatRT: null });
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = orig.call(this, type, attrs);
    if (ctx && /webgl/.test(String(type)) && !ctx.__probed) {
      ctx.__probed = true;
      log.contexts.push({ type, w: this.width, h: this.height, attrs: JSON.stringify(attrs || {}) });
      const gl = ctx;
      const cs = gl.compileShader.bind(gl);
      gl.compileShader = (s) => { cs(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) log.shaderFail.push((gl.getShaderInfoLog(s) || '').slice(0, 400) + ' :: ' + (gl.getShaderSource(s) || '').slice(0, 120).replace(/\\n/g, ' ')); };
      const lp = gl.linkProgram.bind(gl);
      gl.linkProgram = (p) => { lp(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) log.linkFail.push((gl.getProgramInfoLog(p) || '').slice(0, 400)); };
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
        const f = gl[name]; if (!f) continue;
        gl[name] = function () { log.draws++; const r = f.apply(this, arguments); if (log.draws % 40 === 1) { const e = gl.getError(); if (e && log.glErrors.length < 12) log.glErrors.push(name + ':0x' + e.toString(16)); } return r; };
      }
      const ge = gl.getSupportedExtensions ? gl.getSupportedExtensions() : [];
      log.extensions = ge.filter((x) => /float|half|color_buffer/.test(x));
    }
    return ctx;
  };
})();
`;

async function pixelStats(page: Page, png: Buffer): Promise<{ w: number; h: number; nonBlack: number; colors: number; jpeg: string }> {
  return page.evaluate(async (b64: string) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nb = 0; const seen = new Set<number>(); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!; if (l > 8) nb++; seen.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3)); }
    const s = document.createElement("canvas"); const k = 480 / c.width; s.width = 480; s.height = Math.round(c.height * k);
    s.getContext("2d")!.drawImage(c, 0, 0, s.width, s.height);
    return { w: c.width, h: c.height, nonBlack: nb / n, colors: seen.size, jpeg: s.toDataURL("image/jpeg", 0.6).split(",")[1]! };
  }, png.toString("base64"));
}

for (const route of ROUTES) {
  test(`teleoperator black-canvas ${TAG} ${route}`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = []; const bad: string[] = []; const consoleMsgs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
    page.on("pageerror", (e) => errors.push(String(e.message ?? e).slice(0, 300)));
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 160)}`); });
    page.on("requestfailed", (r) => bad.push(`FAILED ${r.url().replace(BASE, "").slice(0, 160)} ${r.failure()?.errorText ?? ""}`));
    await page.addInitScript(GL_PROBE);
    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(BOOT_WAIT_MS);
    const state = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const hook = Object.keys(w).find((k) => /^__AURA_/.test(k)) ?? null;
      const probe = w.__GLPROBE ?? null;
      const canvases = Array.from(document.querySelectorAll("canvas")).map((c) => `${c.width}x${c.height}@${c.getBoundingClientRect().width | 0}x${c.getBoundingClientRect().height | 0}`);
      let diag: unknown = null;
      try { const h = hook ? w[hook] : null; const f = h?.diagnostics ?? h?.diag ?? h?.state; diag = typeof f === "function" ? f.call(h) : f; } catch (e) { diag = `ERR ${String((e as Error).message).slice(0, 120)}`; }
      return { hook, canvases, probe, diag: JSON.stringify(diag ?? null).slice(0, 700), title: document.title, bodyText: document.body.innerText.slice(0, 160).replace(/\n/g, "|") };
    });
    await page.addStyleTag({ content: "html.__co *{visibility:hidden !important} html.__co canvas{visibility:visible !important}" });
    await page.evaluate(() => document.documentElement.classList.add("__co"));
    const shot = await page.screenshot({ type: "png" });
    const stats = await pixelStats(page, shot);
    const tag = `${TAG}-${route.replace(/\W+/g, "_")}`;
    console.log(`TELEOBLACK_RESULT ${tag} ${JSON.stringify({ stats: { w: stats.w, h: stats.h, nonBlack: stats.nonBlack, colors: stats.colors }, hook: state.hook, canvases: state.canvases, probe: state.probe, diag: state.diag, errors, bad: bad.slice(0, 20), consoleMsgs: consoleMsgs.slice(0, 20) })}`);
    console.log(`TELEOBLACK_JPG ${tag} ${stats.jpeg}`);
    // Regression guard for the 4.3.0 black canvas: the 3D canvas must draw, with no missing /aura-assets files.
    expect(bad.filter((b) => /aura-assets/.test(b)), "missing asset files").toEqual([]);
    expect((state.probe as { draws: number } | null)?.draws ?? 0, "GL draw calls").toBeGreaterThan(0);
    expect(stats.nonBlack, "non-black canvas fraction").toBeGreaterThan(0.5);
  });
}
