import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Bunker Zero facing probe (remote only, software WebGL2). For every enemy kind: stage the enemy in front of the player, draw it with the
 * legacy forward axis ("-z", what the render code assumed before 4.3.1) and with the configured one, print the angle between where it is
 * drawn looking and the player, plus a frame each. Then turn the enemy away and measure how long it takes to face the player again.
 * Env: BZFACE_TAG (label).
 */
const TAG = process.env.BZFACE_TAG ?? "run";
const KINDS = ["guard", "dog", "gunner", "boss"] as const;
type Qa = {
  stage(kind: string, dist?: number, bearingDeg?: number): { ok: boolean; reason?: string; floor?: number; distance?: number };
  setForward(kind: string, axis: string | null): void;
  turnAway(kind: string): boolean;
  advance(seconds: number): void;
  unfreeze(): void;
  report(): Array<{ kind: string; state: string; forward: string; errorDeg: number; distance: number }>;
};

let server: ExampleDevServer;
test.setTimeout(1_500_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test("bunker zero enemies face the player", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error ${m.text()}`.slice(0, 300)); });
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(`${server.origin}/apps/showcase-bunker-zero/index.html`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction(() => (window as unknown as { __AURA3D_ROUTE_READY__?: { ready?: boolean } }).__AURA3D_ROUTE_READY__?.ready === true, undefined, { timeout: 240_000 });
  await page.evaluate(() => { for (const id of ["bz-menu", "bz-hud"]) document.getElementById(id)?.classList.add("hidden"); });
  const failures: string[] = [];
  const shot = async (name: string) => {
    await page.waitForTimeout(1500);
    const buf = await page.screenshot({ type: "jpeg", quality: 72 });
    console.log(`BZFACE_FRAME ${TAG} ${name} ${buf.toString("base64")}`);
  };
  for (const kind of KINDS) {
    const staged = await page.evaluate((k) => (window as unknown as { __AURA_BUNKER_ZERO_QA__: Qa }).__AURA_BUNKER_ZERO_QA__.stage(k, 4.5), kind);
    console.log(`BZFACE_STAGE ${kind} ${JSON.stringify(staged)}`);
    expect(staged.ok, `stage ${kind}`).toBe(true);
    for (const forward of ["-z", null] as const) {
      const rep = await page.evaluate(([k, axis]) => {
        const qa = (window as unknown as { __AURA_BUNKER_ZERO_QA__: Qa }).__AURA_BUNKER_ZERO_QA__;
        qa.setForward(k as string, axis as string | null);
        // snap the drawn yaw to the sim heading for the chosen axis: unfreeze one 60 Hz step per 20 ms until it converges
        qa.unfreeze();
        qa.advance(1.0);
        return qa.report().find((r) => r.kind === k);
      }, [kind, forward] as const);
      const label = forward === null ? "configured" : "legacy-z";
      console.log(`BZFACE_REPORT ${kind} ${label} ${JSON.stringify(rep)}`);
      await shot(`${kind}-${label}`);
      if (forward === null && rep && rep.errorDeg > 10) failures.push(`${kind} drawn ${rep.errorDeg} degrees off the player (> 10)`);
    }
    // convergence: turn the drawn model away, then watch it turn back while the sim ticks
    const conv = await page.evaluate((k) => {
      const qa = (window as unknown as { __AURA_BUNKER_ZERO_QA__: Qa }).__AURA_BUNKER_ZERO_QA__;
      qa.setForward(k, null);
      qa.advance(0.5);
      qa.turnAway(k);
      const series: number[] = [];
      for (let i = 0; i < 30; i++) { qa.advance(1 / 60); series.push(qa.report().find((r) => r.kind === k)?.errorDeg ?? -1); }
      return series;
    }, kind);
    const at04 = conv[23] ?? 999; // 24 steps of 1/60 = 0.4 s
    console.log(`BZFACE_CONVERGE ${kind} ${JSON.stringify({ start: conv[0], at04, series: conv })}`);
    if (at04 > 10) failures.push(`${kind} still ${at04} degrees off 0.4 s after being turned away`);
  }
  console.log(`BZFACE_ERRORS ${JSON.stringify(errors.slice(0, 8))}`);
  console.log(`BZFACE_DONE ${TAG}`);
  expect(failures).toEqual([]);
});
