import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * GU47 phase 4 (lane g20): Shadowstep Gauntlet sun-shadow probe. Remote only (tools/remote-acr/run.sh). Each variant boots the
 * village view with a `?sh*=` / `?fillx=` / `?keyx=` A/B switch (examples/ninja-runner-port/lighting.ts, world.ts), waits
 * G20P_SETTLE seconds, and logs one canvas JPEG (`G20P_JPG <variant> <i>/<n> <b64>`) plus every shadow-related diagnostics
 * field (`G20P_DIAG <variant> <json>`). Select a shard with `--grep=@s<N>`.
 */
const SETTLE_MS = Number(process.env.G20P_SETTLE ?? 20) * 1000;
const CHUNK = 16000;
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const BASE = "/apps/showcase-ninja-runner-port/?look=evening";
const VARIANTS: readonly (readonly [string, string, number])[] = [
  ["base", "&at=100", 1],
  ["off", "&at=100&shadow=0", 1],
  ["nb", "&at=100&shnb=0.03&shbias=0.0004", 1],
  ["pcf", "&at=100&shfilter=pcf&shnb=0.03&shmax=60", 2],
  ["fill", "&at=100&fillx=0.45&keyx=1.35", 2],
  ["combo", "&at=100&shfilter=pcf&shnb=0.03&shmax=60&fillx=0.5&keyx=1.3", 2],
  ["title", "", 3],
  ["title-combo", "&shfilter=pcf&shnb=0.03&shmax=60&fillx=0.5&keyx=1.3", 3]
];

const log = (line: string): void => { process.stdout.write(`${line}\n`); };

test.describe("g20 shadow probe", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [name, query, shard] of VARIANTS) {
    test(`g20p-${name} @s${shard}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`G20P_ERR ${name} ${e.message.slice(0, 300)}`));
      await page.setViewportSize({ width: 960, height: 540 });
      await page.goto(`${server.origin}${BASE}${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 500 });
      await page.waitForTimeout(SETTLE_MS);
      const diag = await page.evaluate(() => {
        const app = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__?.all()[0];
        const out: Record<string, unknown> = {};
        const walk = (v: unknown, path: string, depth: number): void => {
          if (depth > 6 || v === null || typeof v !== "object") return;
          for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
            const p = `${path}.${k}`;
            if (/shadow|cascade|caster/i.test(k)) out[p] = child;
            else walk(child, p, depth + 1);
          }
        };
        try { walk(app?.diagnostics?.(), "diag", 0); } catch (e) { out.diagErr = String(e); }
        try { out.lighting = app?.lighting?.diagnostics?.() ?? null; } catch (e) { out.lightingErr = String(e); }
        try { out.tap = (globalThis as Record<string, unknown>).__A3D_SHADOW_TAP_TIER__ ?? null; } catch { /* optional */ }
        try { out.look = (globalThis as unknown as { __AURA_NINJA_RUNNER__?: { look?: () => unknown } }).__AURA_NINJA_RUNNER__?.look?.() ?? null; } catch { /* optional */ }
        return JSON.stringify(out, (_k, v) => (typeof v === "number" ? Number(v.toFixed(4)) : v)).slice(0, 12000);
      });
      log(`G20P_DIAG ${name} ${diag}`);
      const jpg = (await page.screenshot({ type: "jpeg", quality: 88 })).toString("base64");
      const n = Math.ceil(jpg.length / CHUNK);
      for (let i = 0; i < n; i++) log(`G20P_JPG ${name} ${i + 1}/${n} ${jpg.slice(i * CHUNK, (i + 1) * CHUNK)}`);
      log(`G20P_DONE ${name}`);
    });
  }
});
