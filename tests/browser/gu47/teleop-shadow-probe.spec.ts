import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { glMetaInPage } from "../game-luma-stats";

/**
 * GU47 phase 4 (lane g04, Grid Dispatch): why do the key's cast shadows not read in the software WebGL2 captures?
 * Loads the game per PROBE_URLS (comma list of query strings, default noon and noon with the shadow kill switch), waits
 * PROBE_SETTLE_S seconds after ready, then logs the diagnostics shadow/lighting sections (`TP_DIAG <json>`) and a
 * canvas-only JPEG (`GL_JPG teleop-probe <tag> i/n <b64>`, decode-luma.mjs format). Remote only (tools/remote-acr/run.sh).
 */
const URLS = (process.env.PROBE_URLS ?? "sky=noon&intro=0,sky=noon&intro=0&a3dLighting=shadows=off,sky=golden&intro=0").split(",");
const SETTLE_MS = Number(process.env.PROBE_SETTLE_S ?? 25) * 1000;
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

test.describe("teleoperator shadow probe", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("teleop shadow probe", async ({ page }) => {
    page.on("pageerror", (e) => log(`TP_ERR pageerror ${e.message.slice(0, 300)}`));
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const [i, q] of URLS.entries()) {
      const tag = `p${i}`;
      await page.goto(`${server.origin}/apps/showcase-teleoperator/?${q.replaceAll(";", "&")}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
      await page.waitForTimeout(SETTLE_MS);
      const diag = await page.evaluate(() => {
        const g = globalThis as unknown as Record<string, unknown> & { __AURA3D_LIVE_APPS__?: { all(): any[] } };
        const app = g.__AURA3D_LIVE_APPS__?.all()[0];
        const dg = app?.diagnostics?.() ?? {};
        const safe = (v: unknown) => { try { return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x))); } catch (e) { return String(e); } };
        return safe({
          shadows: dg.shadows, lighting: dg.lighting, rendererShadow: dg.renderer?.runtime?.shadow, warnings: dg.warnings ?? dg.renderer?.runtime?.warnings,
          tap: g.__A3D_SHADOW_TAP_TIER__, dense: g.__A3D_DENSE_SHADOW_CAP__, drawCalls: dg.drawCalls, triangles: dg.triangles
        });
      });
      log(`TP_DIAG ${tag} ${q} ${JSON.stringify(diag).slice(0, 60000)}`);
      const handle = await page.addStyleTag({ content: CANVAS_ONLY });
      await page.waitForTimeout(250);
      const png = await page.screenshot({ type: "png" });
      const meta = await page.evaluate(glMetaInPage, { png: png.toString("base64"), crops: [] });
      log(`TP_META ${tag} ${JSON.stringify(meta.v1)}`);
      const n = Math.ceil(meta.jpeg.length / CHUNK);
      for (let k = 0; k < n; k++) log(`GL_JPG teleop-probe ${tag} ${k + 1}/${n} ${meta.jpeg.slice(k * CHUNK, (k + 1) * CHUNK)}`);
      await handle.evaluate((el) => el.remove());
    }
  });
});
