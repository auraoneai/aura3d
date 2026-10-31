import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { startServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

/**
 * GU47 phase 3: the index card for Aura Diamond 3D. The shared shotsa card waits a fixed 10 s, which on software WebGL2
 * lands inside the park intro rail (an aerial "PLAY BALL" shot). This card waits until the intro sequence has ended
 * (`__AURA3D_GAME_EVIDENCE__.sequence.active` is null) and the broadcast camera is back, then shoots 16:10 at 1x and 2x.
 * Same `@@FRAME` / `@@SHOTSA` lines as tests/browser/shotsa-lib.ts, so tools/shots/decode-frames.mjs decodes them.
 */
const SLUG = "aura-diamond-3d";
const ROUTE = "/apps/showcase-aura-diamond-3d/index.html?mode=quick";
const FRAME_CHUNK = 30_000;

let server: ExampleDevServer;
test.setTimeout(1_800_000);
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server?.close(); });

function emit(name: string, buf: Buffer): void {
  const dir = path.resolve("tests/reports/shotsa", SLUG, "card");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.jpg`), buf);
  const b64 = buf.toString("base64");
  const total = Math.ceil(b64.length / FRAME_CHUNK);
  for (let i = 0; i < total; i += 1) process.stdout.write(`@@FRAME ${SLUG}/card/${name} ${i + 1}/${total} ${b64.slice(i * FRAME_CHUNK, (i + 1) * FRAME_CHUNK)}\n`);
}

test("shotsa aura-diamond-3d card after the park intro", async ({ browser }) => {
  for (const scale of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: scale });
    const page = await ctx.newPage();
    try {
      await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "load", timeout: 240_000 });
      await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__AURA3D_GAME_DIAMOND__), undefined, { timeout: 420_000 });
      // The intro sequence starts after boot; wait until one has played and ended (or 4 minutes of slow software frames).
      await page.waitForFunction(() => {
        const e = (window as unknown as Record<string, any>).__AURA3D_GAME_EVIDENCE__;
        return Boolean(e && e.ready && e.sequence && e.sequence.active === null && Object.values(e.sequence.played ?? {}).some((n) => Number(n) > 0));
      }, undefined, { timeout: 240_000, polling: 1_000 }).catch(() => undefined);
      await page.waitForTimeout(4_000);
      emit(`card-${scale}x`, await page.screenshot({ type: "jpeg", quality: 88 }));
      process.stdout.write(`@@SHOTSA ${SLUG} card ${scale}x ok\n`);
    } catch (e) {
      process.stdout.write(`@@SHOTSA ${SLUG} card ${scale}x FAILED ${(e as Error).message.slice(0, 120)}\n`);
    } finally {
      await ctx.close();
    }
  }
});
