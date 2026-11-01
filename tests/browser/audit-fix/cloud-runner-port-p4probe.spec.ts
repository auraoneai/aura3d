import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 phase 4, lane g25 (Cumulus Dash): shadow probe. For each query below: boot, place(60) and place(520), log
 * `app.diagnostics().lighting` and the warnings, shoot HUD-visible page frames (RB_JPG, same format as the rubric spec, so
 * evidence/game-upgrades-47/cloud-runner-port/decode-rubric.mjs decodes them). Remote only (tools/remote-acr/run.sh).
 * Frames are software WebGL2 (SwiftShader), not GPU evidence.
 */
const BASE = "/examples/kid-goku-beyond-the-clouds-port/";
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
type Api = Record<string, any>;
declare global { interface Window { __AURA_CUMULUS_DASH__?: Api } }

/* probe 2 variants: one camera-fitted cascade to 70 m (custom programs sample one cascade per draw, picked from the draw centre). */
const VARIANTS: readonly [string, string][] = [
  ["c1pcf", "shf=pcf&shd=70&shc=1&shm=4096&"],
  ["c1pcss", "shd=70&shc=1&shm=4096&"]
];

async function shoot(page: Page, shot: string): Promise<void> {
  const b64 = (await page.screenshot({ type: "jpeg", quality: 88 })).toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`RB_JPG ${shot} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("p4probe", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });
  test("p4probe shadows 1280x720", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    page.on("pageerror", (e) => log(`RB_ERR pageerror ${e.message.slice(0, 300)}`));
    for (const [label, query] of VARIANTS) {
      await page.goto(`${server.origin}${BASE}?${query}manual=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__AURA_CUMULUS_DASH__?.ready === true, undefined, { timeout: 600_000, polling: 1000 });
      await page.waitForTimeout(20_000);
      for (const [shot, body] of [["0060", "a.begin(); a.place(60); a.play(90); a.settle(4, false);"], ["0520", "a.place(520); a.play(60); a.settle(4, false);"]] as const) {
        await page.evaluate((b) => { const a = window.__AURA_CUMULUS_DASH__!; new Function("a", b)(a); }, body);
        await page.waitForTimeout(8_000);
        const diag = await page.evaluate(() => {
          const a = window.__AURA_CUMULUS_DASH__!; a.settle(2, false);
          const d = (a.diagnostics?.() ?? {}) as any;
          return JSON.stringify({ lighting: d.lighting ? { shadows: d.lighting.shadows, droppedFeatures: d.lighting.droppedFeatures, contactShadows: d.lighting.contactShadows, environment: d.lighting.environment } : null, warnings: (d.warnings ?? []).map((w: any) => (typeof w === "string" ? w : w.code ?? JSON.stringify(w)).slice(0, 160)), quality: d.quality ?? d.tier ?? null }).slice(0, 3000);
        });
        log(`RB_META ${JSON.stringify({ shot: `${label}-${shot}` })} ${diag}`);
        await shoot(page, `${label}-${shot}`);
      }
    }
    log("RB_DONE p4probe");
  });
});
