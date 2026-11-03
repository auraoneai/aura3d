import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * GU47 phase 6 (lane g17): per-draw breakdown of Serpentine Sky Run for the draw budget (PRD D7). Remote only
 * (tools/remote-acr/run.sh). A WebGL2 hook records every draw of a frame (program, bound framebuffer, vertex array, index
 * count, instance count) and each program's active uniform names, which name the custom material that issued it. Logs:
 *   GL_DRAWS <json>   one row per variant: engine drawCalls/triangles and the draws of the last complete frame
 * DRAWLIST_URLS=<path>,<path> overrides the default URLs (default view, stage 4).
 */

const URLS = (process.env.DRAWLIST_URLS ?? "/apps/showcase-serpentine-sky-run-port/,/apps/showcase-serpentine-sky-run-port/?stage=4").split(",");
const SETTLE_S = Number(process.env.DRAWLIST_SETTLE ?? 25);
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

const HOOK = `(() => {
  const P = WebGL2RenderingContext.prototype;
  const ids = new WeakMap(); let next = 1;
  const id = (o) => { if (!o) return 0; let v = ids.get(o); if (!v) { v = next++; ids.set(o, v); } return v; };
  const progs = {}; let prog = null; let fb = 0; let vao = 0;
  let cur = []; let last = []; let frames = 0;
  const uP = P.useProgram; P.useProgram = function (p) { prog = p; return uP.call(this, p); };
  const bF = P.bindFramebuffer; P.bindFramebuffer = function (t, f) { if (t !== this.READ_FRAMEBUFFER) fb = id(f); return bF.call(this, t, f); };
  const bV = P.bindVertexArray; P.bindVertexArray = function (v) { vao = id(v); return bV.call(this, v); };
  const describe = (gl, p) => {
    const k = id(p); if (progs[k]) return k;
    const names = []; try { const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); if (u) names.push(u.name); } } catch (e) {}
    progs[k] = names.filter((s) => !/^(u_?)?(model|view|proj|normalMatrix|camera)/i.test(s)).slice(0, 14).join(",");
    return k;
  };
  const rec = (gl, mode, count, inst) => { cur.push([describe(gl, prog), fb, vao, count, inst]); };
  const dA = P.drawArrays; P.drawArrays = function (m, f, c) { rec(this, m, c, 1); return dA.apply(this, arguments); };
  const dE = P.drawElements; P.drawElements = function (m, c) { rec(this, m, c, 1); return dE.apply(this, arguments); };
  const dAI = P.drawArraysInstanced; P.drawArraysInstanced = function (m, f, c, n) { rec(this, m, c, n); return dAI.apply(this, arguments); };
  const dEI = P.drawElementsInstanced; P.drawElementsInstanced = function (m, c, t, o, n) { rec(this, m, c, n); return dEI.apply(this, arguments); };
  const dR = P.drawRangeElements; P.drawRangeElements = function (m, s, e, c) { rec(this, m, c, 1); return dR.apply(this, arguments); };
  const raf = window.requestAnimationFrame.bind(window); let stamp = -1;
  window.requestAnimationFrame = (cb) => raf((t) => { if (t !== stamp) { stamp = t; if (cur.length) { last = cur; frames++; } cur = []; } cb(t); });
  window.__G17_DRAWS__ = () => ({ frames, progs, draws: last });
})();`;

test.describe("g17 draw list", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const url of URLS) {
    test(`serpentine draw list v-${(url.split("?")[1] ?? "default").replace(/[^a-z0-9]/gi, "")}`, async ({ page }) => {
      await page.addInitScript(HOOK);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${url}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
      await page.waitForTimeout(SETTLE_S * 1000);
      for (let i = 0; i < 2; i++) {
        const row = await page.evaluate(() => {
          const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
          const dg = app?.diagnostics?.();
          return { drawCalls: dg?.drawCalls ?? null, triangles: dg?.triangles ?? null, list: (globalThis as any).__G17_DRAWS__?.() ?? null };
        });
        log(`GL_DRAWS ${JSON.stringify({ url, i, ...row })}`);
        await page.waitForTimeout(8000);
      }
    });
  }
});
