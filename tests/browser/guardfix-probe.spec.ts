import { test } from "@playwright/test";

/**
 * Diagnostic probe for the black-frame guard misfire (remote only, tools/remote-acr/run.sh). Loads LIVE pages with the
 * guard ON and records, from an init script that runs before any page script: every WebGL context's requested and actual
 * attributes, which canvases are WebGL versus 2D, how many GL draw calls happen inside versus outside a
 * requestAnimationFrame task, and what each guard probe (a drawImage of a canvas into the guard's 2D probe) actually saw.
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const APPS = (process.env.GF_APPS ?? "showcase-cross-hop,showcase-iron-crown,showcase-bunker-zero").split(",");
const WAIT_MS = Number(process.env.GF_WAIT_MS ?? 70000);

test.describe.configure({ mode: "serial" });
test.setTimeout(600000);

for (const app of APPS) {
  test(`guard probe: ${app}`, async ({ page }) => {
    const nav: string[] = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) nav.push(f.url().replace(BASE, "")); });
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const gf = { ctx: [] as unknown[], types: new Map<HTMLCanvasElement, string>(), rafStarts: 0, drawsIn: 0, drawsOut: 0, drawsFrame: 0, inRaf: false, probes: [] as unknown[], probeCount: 0 };
      w.__GF__ = gf;
      const origGet = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, t: string, a?: unknown) => unknown;
      (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
        const c = origGet.call(this, type, attrs) as { getContextAttributes?: () => unknown } | null;
        if (!gf.types.has(this)) gf.types.set(this, type);
        if (/webgl/.test(type)) gf.ctx.push({ id: this.id, cls: this.className, w: this.width, h: this.height, type, requested: attrs ?? null, actual: c?.getContextAttributes ? c.getContextAttributes() : null, offscreenTransferred: false });
        return c;
      };
      const wrapDraw = (proto: Record<string, unknown> | undefined) => {
        if (!proto) return;
        for (const fn of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
          const o = proto[fn] as ((...a: unknown[]) => unknown) | undefined;
          if (!o) continue;
          proto[fn] = function (this: unknown, ...a: unknown[]) {
            if (gf.inRaf) gf.drawsIn += 1; else gf.drawsOut += 1;
            gf.drawsFrame += 1;
            return o.apply(this, a);
          };
        }
      };
      wrapDraw(typeof WebGL2RenderingContext !== "undefined" ? (WebGL2RenderingContext.prototype as unknown as Record<string, unknown>) : undefined);
      wrapDraw(typeof WebGLRenderingContext !== "undefined" ? (WebGLRenderingContext.prototype as unknown as Record<string, unknown>) : undefined);
      const origRaf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb: FrameRequestCallback) => origRaf((t) => {
        gf.inRaf = true; gf.rafStarts += 1; gf.drawsFrame = 0;
        try { cb(t); } finally { gf.inRaf = false; }
      });
      const origDraw = CanvasRenderingContext2D.prototype.drawImage as (this: CanvasRenderingContext2D, ...a: unknown[]) => void;
      (CanvasRenderingContext2D.prototype as unknown as { drawImage: unknown }).drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
        const src = a[0] as unknown;
        const isCanvas = typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement;
        const drawsBefore = gf.drawsFrame;
        const wasInRaf = gf.inRaf;
        origDraw.apply(this, a);
        if (isCanvas && this.canvas.width <= 64 && this.canvas.height <= 64) {
          gf.probeCount += 1;
          if (gf.probes.length < 40 && gf.probeCount % 3 === 1) {
            let lit = -1;
            try { const d = this.getImageData(0, 0, this.canvas.width, this.canvas.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.max(d[i]!, d[i + 1]!, d[i + 2]!) > 4) n++; lit = n / (d.length / 4); } catch { lit = -2; }
            const s = src as HTMLCanvasElement;
            gf.probes.push({ id: s.id, cls: s.className, w: s.width, h: s.height, type: gf.types.get(s) ?? "unknown", inRaf: wasInRaf, drawsThisFrameBeforeProbe: drawsBefore, lit });
          }
        }
      };
    });
    const response = await page.goto(`${BASE}/apps/${app}/`, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(WAIT_MS);
    const snap = await page.evaluate(() => {
      const gf = (window as unknown as { __GF__?: Record<string, unknown> & { types: Map<HTMLCanvasElement, string> } }).__GF__;
      const heal = (window as unknown as { __AURA3D_HEAL__?: { rung: number; name: string; enabled: boolean; observation?: () => unknown } }).__AURA3D_HEAL__;
      const canvases = Array.from(document.querySelectorAll("canvas")).map((c) => ({ id: c.id, cls: c.className, w: c.width, h: c.height, type: gf?.types.get(c) ?? "none", display: getComputedStyle(c).display, vis: getComputedStyle(c).visibility }));
      return {
        url: location.pathname + location.search,
        rung: heal?.rung, rungName: heal?.name, observation: heal?.observation?.(),
        canvases,
        ctx: gf?.ctx, rafStarts: gf?.rafStarts, drawsIn: gf?.drawsIn, drawsOut: gf?.drawsOut, probeCount: gf?.probeCount, probes: gf?.probes,
        sessionKeys: Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`)
      };
    }).catch((e) => ({ error: String(e) }));
    process.stdout.write(`@@GF ${app} status=${response?.status()} nav=${JSON.stringify(nav)} ${JSON.stringify(snap)}\n`);
  });
}
