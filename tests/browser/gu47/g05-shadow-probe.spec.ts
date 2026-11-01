import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { glMetaInPage } from "../game-luma-stats";

/**
 * GU47 phase 4 lane g05: why Iron Crown shows no cast shadows in software WebGL2 captures. Remote only
 * (tools/remote-acr/run.sh). Per venue (`G05_PROBE_STAGES`, default colosseum-ruins,crown-arena) and per extra query
 * (`G05_PROBE_QUERIES`, `;`-separated, default "" and aura3d-quality=high): GL_PROBE <json> with every shadow / quality / light field of
 * `app.diagnostics()`, plus a GL_META / GL_JPG frame (decode-luma.mjs) named `probe-<n>`.
 */
const STAGES = (process.env.G05_PROBE_STAGES ?? "colosseum-ruins,crown-arena").split(",");
const QUERIES = (process.env.G05_PROBE_QUERIES ?? ";aura3d-quality=high").split(";");
const SETTLE_MS = Number(process.env.G05_PROBE_SETTLE_S ?? 30) * 1000;
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

test.describe("g05 shadow probe", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("g05 shadow probe", async ({ page }) => {
    page.on("pageerror", (e) => log(`GL_ERR probe pageerror ${e.message.slice(0, 300)}`));
    await page.setViewportSize({ width: 1280, height: 720 });
    let n = 0;
    for (const query of QUERIES) {
      for (const stage of STAGES) {
        n += 1;
        const target = `iron-crown--probe-${n}`;
        const q = query;
        await page.goto(`${server.origin}/apps/showcase-iron-crown/${q ? `?${q}` : ""}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
        if (stage !== "crown-arena") await page.evaluate((s) => (document.querySelector(`#ic-venues button[data-stage="${s}"]`) as HTMLElement | null)?.click(), stage);
        await page.waitForTimeout(SETTLE_MS);
        const probe = await page.evaluate(() => {
          const app = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__?.all()[0];
          const dg = app?.diagnostics?.();
          const out: Record<string, unknown> = {};
          const walk = (v: unknown, path: string, depth: number): void => {
            if (depth > 7 || v === null || typeof v !== "object") return;
            for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
              const p = path ? `${path}.${k}` : k;
              if (/shadow|tier|quality|cascade|light/i.test(k)) out[p] = JSON.stringify(child)?.slice(0, 1500);
              else walk(child, p, depth + 1);
            }
          };
          walk(dg, "", 0);
          return out;
        });
        log(`GL_PROBE ${JSON.stringify({ n, stage, query, probe })}`);
        const handle = await page.addStyleTag({ content: CANVAS_ONLY });
        await page.waitForTimeout(250);
        const png = await page.screenshot({ type: "png" });
        const meta = await page.evaluate(glMetaInPage, { png: png.toString("base64"), crops: [] });
        log(`GL_META ${JSON.stringify({ target: target, id: `probe-${n}`, slug: "iron-crown", variant: `probe-${n}`, ...meta.v1, info: {}, ...meta.v2 })}`);
        const b64 = meta.jpeg as string;
        const chunks = Math.ceil(b64.length / CHUNK);
        for (let i = 0; i < chunks; i++) log(`GL_JPG ${target} probe-${n} ${i + 1}/${chunks} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
        await handle.evaluate((el) => el.remove());
      }
    }
  });
});
