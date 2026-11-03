import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 phase-6 lane e6 probe (remote runner only, tools/remote-acr/run.sh; never local).
 * 1. g09 handoff: textured-material rows still `pending` on Aura FC 3D, now with the engine's `stage` / `pendingMs`
 *    fields, so the step a stuck upgrade waits on is named (`E6_TEX` lines).
 * 2. g01 / g10 handoff: the quality tier, post stages and reflection state the software WebGL2 runner actually uses
 *    on Aura Slam and Aura Links (`E6_DIAG` lines: every diagnostics path whose key names a tier, quality, SSR,
 *    reflection, water or stage).
 */
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

let server: ExampleDevServer;
test.setTimeout(1_800_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

for (const venue of ["munich", "lagos"] as const) {
  test(`e6-tex-${venue}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/apps/showcase-aura-fc-3d/index.html?venue=${venue}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 1000 });
    for (const wait of [20_000, 30_000]) {
      await page.waitForTimeout(wait);
      const rows = await page.evaluate(() => {
        const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all?.()[0];
        const list: any[] = app?.diagnostics?.()?.renderer?.runtime?.texturedMaterials ?? [];
        return list.map((r) => ({ node: r.nodeName, status: r.status, stage: r.stage, pendingMs: r.pendingMs, slots: r.slots, warnings: (r.warnings ?? []).slice(0, 2) }));
      });
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
      log(`GL_META ${JSON.stringify({ target: `e6-tex-${venue}`, wait })}`);
      log(`E6_TEX ${JSON.stringify({ venue, wait, counts, pending: rows.filter((r) => r.status === "pending"), fallback: rows.filter((r) => r.status === "fallback").slice(0, 4) })}`);
    }
  });
}

const DIAG_TARGETS = [
  ["top-tennis", "/apps/showcase-top-tennis/"],
  ["links-stAuroras", "/apps/showcase-aura-links-3d/index.html?course=stAuroras"],
  ["links-mapleHollow", "/apps/showcase-aura-links-3d/index.html?course=mapleHollow"]
] as const;

for (const [name, path] of DIAG_TARGETS) {
  test(`e6-diag-${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 1000 });
    await page.waitForTimeout(15_000);
    const out = await page.evaluate(() => {
      const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all?.()[0];
      const diag = app?.diagnostics?.() ?? {};
      const hits: Record<string, string> = {};
      const re = /tier|quality|ssr|reflect|water|stage|renderPath|rendererString|unmasked|gpu|msaa|environmentSize|pass/i;
      const seen = new Set<unknown>();
      const walk = (v: unknown, path: string, depth: number): void => {
        if (depth > 7 || v === null || typeof v !== "object" || seen.has(v)) return;
        seen.add(v);
        for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
          const p = path ? `${path}.${k}` : k;
          if (re.test(k)) {
            const s = typeof child === "object" ? JSON.stringify(child) : String(child);
            hits[p] = (s ?? "").slice(0, 300);
          }
          if (Object.keys(hits).length < 120) walk(child, p, depth + 1);
        }
      };
      walk(diag, "", 0);
      const gl = (document.querySelector("canvas") as HTMLCanvasElement | null)?.getContext("webgl2") as WebGL2RenderingContext | null;
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      const glRenderer = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
      return { glRenderer, hits };
    });
    log(`GL_META ${JSON.stringify({ target: `e6-diag-${name}` })}`);
    const entries = Object.entries(out.hits);
    log(`E6_DIAG ${JSON.stringify({ name, glRenderer: out.glRenderer, n: entries.length })}`);
    for (let i = 0; i < entries.length; i += 12) log(`E6_DIAG_PART ${JSON.stringify({ name, part: Object.fromEntries(entries.slice(i, i + 12)) })}`);
  });
}
