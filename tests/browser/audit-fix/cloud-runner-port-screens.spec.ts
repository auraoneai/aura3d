import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { finc, raf, say, settleTextures, shoot, waitReady, type Cfg } from "../finc-lib";
import { CLOUD } from "../finc-games";

/**
 * Audit lane g25 (Cumulus Dash), row RH-05: retake `evidence/kid-goku-beyond-the-clouds-port/screens/final` on the
 * lane build with the same file names and sizes. Remote only (tools/remote-acr/run.sh); decode with
 * `node tools/shots/decode-finc.mjs <acr-run.log> <outRoot>`.
 * Changes against the 2026-10-25 capture (finc-games.ts CLOUD and CLOUD_JUMP):
 *  - `results` is a real won result card (run from 1950 m to the end), not the forced `place(1000000)` cutscene;
 *    `results-lost` (new) is a real lost card (last heart lost on the first obstacle).
 *  - `key-jump` uses the CLOUD_JUMP drive (placed at 600 m, clear of the opening log) inside the same desktop run.
 *  - the phone frames emulate a touch device (`hasTouch`, `isMobile`), so the touch controls and touch hints show.
 * Run one part per remote run: `--grep "final cloud desktop"`, `--grep "screens mobile"`, `--grep "final cloud (dsf2|card)"`.
 */
const IDLE = "{ steer: 0, jump: false, pole: false, nimbus: false, brake: false }";
const JUMP = "{ steer: 0, jump: true, pole: false, nimbus: false, brake: false }";
const WIN = "api.place(1950, {}); for (let i = 0; i < 60 && api.game().phase !== 'result'; i++) api.play(60); api.settle(2, false);";
const LOSE = "api.place(40, { lane: 2.6 }); api.raw().hearts = 1; for (let i = 0; i < 10 && api.game().phase !== 'result'; i++) api.play(30); api.settle(2, false);";

const SCREENS: Cfg = {
  ...CLOUD,
  steps: [
    { name: "gameplay-early", mobile: true, drive: "api.begin(); api.settle(20, true);" },
    { name: "key-run", mobile: true, drive: `api.play(120, ${IDLE}); api.settle(2, false);` },
    { name: "key-jump", drive: `api.place(600, {}); api.settle(10, true); api.play(2, ${JUMP}); api.play(10, ${IDLE}); api.settle(2, false);` },
    { name: "mid-track", drive: "api.place(600, {}); api.settle(30, true);" },
    { name: "results", drive: WIN },
    { name: "results-lost", drive: LOSE }
  ]
};

finc([SCREENS], ["desktop", "dsf2", "card"], { settleBudgetMs: 1_500_000, dsf2Size: [640, 360] });

test.describe("screens mobile", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("screens mobile touch 390x844", async ({ browser }) => {
    const [w, h] = SCREENS.mobile;
    const tag = `${w}x${h}`;
    const errors: string[] = [];
    const open = async (query: string) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
      page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
      await page.goto(`${server.origin}${SCREENS.base}${query}`, { waitUntil: "domcontentloaded" });
      return { ctx, page, ready: await waitReady(page, SCREENS.hook, 1_500_000) };
    };
    {
      const { ctx, page, ready } = await open(SCREENS.titleQuery);
      say("SCSTATE", SCREENS.slug, { tag, state: "title", ready });
      if (ready) { await raf(page, 8); await shoot(page, SCREENS.slug, tag, "title"); }
      await ctx.close();
    }
    const { ctx, page, ready } = await open(SCREENS.playQuery);
    say("SCSTATE", SCREENS.slug, { tag, state: "play-ready", ready });
    if (ready) {
      let settled = false;
      for (const step of SCREENS.steps.filter((s) => s.mobile)) {
        const drive = () => page.evaluate(({ hk, body }) => new Function("api", body)((window as unknown as Record<string, unknown>)[hk]), { hk: SCREENS.hook, body: step.drive });
        await drive();
        if (!settled) { await settleTextures(page, SCREENS, tag, 1_500_000); settled = true; await drive(); }
        await raf(page, 4);
        await shoot(page, SCREENS.slug, tag, step.name);
        const touch = await page.evaluate(() => {
          const ui = document.getElementById("cr-ui");
          const t = ui?.querySelector<HTMLElement>(".touch");
          return { coarse: ui?.classList.contains("coarse") ?? null, touchShown: t ? getComputedStyle(t).display !== "none" : null, help: ui?.querySelector("[data-q='help']")?.textContent ?? null };
        });
        say("SCSTATE", SCREENS.slug, { tag, state: step.name, touch });
      }
    }
    await ctx.close();
    say("SCERRORS", SCREENS.slug, { tag, errors: errors.slice(0, 10) });
  });
});
