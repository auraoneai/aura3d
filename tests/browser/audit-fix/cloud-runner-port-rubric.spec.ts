import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 phase 3, lane g25 (Cumulus Dash): rubric frames for `aura3d look judge`. Page screenshots at 1280x720 with the HUD
 * visible, default quality, on the shipped default look (`?look=original` with `--grep=rubric.original`).
 * Remote only (tools/remote-acr/run.sh); never local Playwright. Output goes to the log:
 *   RB_META <json>                 shot name, place, phase
 *   RB_JPG  <shot> <i>/<n> <b64>   JPEG page frames, chunked (decode: evidence/game-upgrades-47/cloud-runner-port/decode-rubric.mjs)
 * Frames are software WebGL2 (SwiftShader), not GPU evidence.
 */
const BASE = "/examples/kid-goku-beyond-the-clouds-port/";
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
type Api = Record<string, any>;
declare global { interface Window { __AURA_CUMULUS_DASH__?: Api } }

async function boot(page: Page, origin: string, query: string): Promise<void> {
  page.on("pageerror", (e) => log(`RB_ERR pageerror ${e.message.slice(0, 300)}`));
  await page.goto(`${origin}${BASE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__AURA_CUMULUS_DASH__?.ready === true, undefined, { timeout: 600_000, polling: 1000 });
}

async function shoot(page: Page, shot: string): Promise<void> {
  const b64 = (await page.screenshot({ type: "jpeg", quality: 88 })).toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`RB_JPG ${shot} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** Playing frames along the track: begin a real run, then place (HUD up), let the camera and probes settle, shoot. */
const POINTS: readonly [string, string][] = [
  ["play-0060", "a.begin(); a.place(60); a.play(90); a.settle(4, false);"],
  ["play-0520", "a.place(520); a.play(60); a.settle(4, false);"],
  ["play-1100", "a.place(1100); a.play(60); a.settle(4, false);"],
  ["play-1420", "a.place(1420); a.play(60); a.settle(4, false);"]
];

for (const [label, query] of [["default", ""], ["original", "look=original&"]] as const) {
  test.describe(`rubric ${label}`, () => {
    test.setTimeout(3_000_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });

    test(`rubric ${label} title and play 1280x720`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await boot(page, server.origin, query ? `?${query.slice(0, -1)}` : "");
      await page.waitForTimeout(40_000);
      await shoot(page, `${label}-title`);
      log(`RB_META ${JSON.stringify({ shot: `${label}-title` })}`);
      await page.goto("about:blank");
      await boot(page, server.origin, `?${query}manual=1`);
      await page.waitForTimeout(20_000);
      for (const [shot, body] of POINTS) {
        const snap = await page.evaluate((b) => { const a = window.__AURA_CUMULUS_DASH__!; new Function("a", b)(a); return { s: Math.round(a.game().state.s), phase: a.game().phase }; }, body);
        await page.waitForTimeout(8_000);
        await page.evaluate(() => window.__AURA_CUMULUS_DASH__!.settle(2, false));
        await shoot(page, `${label}-${shot}`);
        log(`RB_META ${JSON.stringify({ shot: `${label}-${shot}`, ...snap })}`);
      }
      log(`RB_DONE ${label}`);
    });
  });
}
