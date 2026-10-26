import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Bunker Zero facing probe (remote only, software WebGL2). For every enemy kind: stage the enemy in front of the player, draw it with the
 * legacy forward axis ("-z", what the render code assumed before 4.3.1) and with the configured one, print the angle between where it is
 * drawn looking and the player, plus a frame each. Then turn the enemy away and measure how long it takes to face the player again.
 * Env: BZFACE_TAG (label).
 */
const TAG = process.env.BZFACE_TAG ?? "run";
const ASSET_ORIGIN = process.env.BZFACE_ASSET_ORIGIN ?? "https://aura3d.auraone.ai";
const ASSET_PATH = /\.(glb|gltf|bin|ktx2|png|jpe?g|webp|wav|mp3|ogg|hdr|exr|json)(\?.*)?$/i;
const KINDS = ["guard", "dog", "gunner", "boss"] as const;
type Qa = {
  stage(kind: string, dist?: number, bearingDeg?: number): { ok: boolean; reason?: string; floor?: number; distance?: number };
  setForward(kind: string, axis: string | null): void;
  turnAway(kind: string): boolean;
  rotateDrawn(kind: string, rad: number): boolean;
  advance(seconds: number): void;
  unfreeze(): void;
  freeze(): void;
  settle(seconds: number): void;
  report(): Array<{ kind: string; state: string; forward: string; errorDeg: number; distance: number }>;
};

let server: ExampleDevServer;
test.setTimeout(1_500_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test("bunker zero enemies face the player", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  // Hash-named model files come from the production build and are not in the checkout: take whatever the local server 404s from the deployed site.
  await ctx.route((url) => ASSET_PATH.test(url.pathname + url.search) && url.hostname !== new URL(ASSET_ORIGIN).hostname, async (route) => {
    const local = await route.fetch().catch(() => null);
    if (local && local.status() < 400 && !(local.headers()["content-type"] ?? "").includes("text/html")) { await route.fulfill({ response: local }); return; }
    const url = new URL(route.request().url());
    const remote = await fetch(`${ASSET_ORIGIN}${url.pathname}${url.search}`).catch(() => null);
    if (remote && remote.ok) await route.fulfill({ status: 200, headers: { "content-type": remote.headers.get("content-type") ?? "application/octet-stream", "access-control-allow-origin": "*" }, body: Buffer.from(await remote.arrayBuffer()) });
    else await route.fulfill(local ? { response: local } : { status: 404, body: "" });
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("requestfailed", (r) => errors.push(`requestfailed ${r.url()}`.slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`.slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error ${m.text()}`.slice(0, 300)); });
  await page.goto(`${server.origin}/apps/showcase-bunker-zero/index.html`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction(() => (window as unknown as { __AURA3D_ROUTE_READY__?: { ready?: boolean } }).__AURA3D_ROUTE_READY__?.ready === true, undefined, { timeout: 240_000 }).catch((e) => {
    console.log(`BZFACE_NOTREADY ${JSON.stringify(errors.slice(0, 12))}`);
    throw e;
  });
  await page.addStyleTag({ content: "body * { visibility: hidden !important } canvas { visibility: visible !important }" });
  const failures: string[] = [];
  const shot = async (name: string) => {
    await page.waitForTimeout(1500);
    const buf = await page.screenshot({ type: "jpeg", quality: 72 });
    console.log(`BZFACE_FRAME ${TAG} ${name} ${buf.toString("base64")}`);
  };
  for (const kind of KINDS) {
    const staged = await page.evaluate((k) => (window as unknown as { __AURA_BUNKER_ZERO_QA__: Qa }).__AURA_BUNKER_ZERO_QA__.stage(k, k === "dog" ? 5.5 : 3.4), kind);
    console.log(`BZFACE_STAGE ${kind} ${JSON.stringify(staged)}`);
    expect(staged.ok, `stage ${kind}`).toBe(true);
    for (const forward of ["-z", null] as const) {
      const rep = await page.evaluate(([k, axis]) => {
        const qa = (window as unknown as { __AURA_BUNKER_ZERO_QA__: Qa }).__AURA_BUNKER_ZERO_QA__;
        qa.setForward(k as string, axis as string | null);
        // let the drawn yaw settle on the sim heading for the chosen axis (the sim stays frozen, the enemy stays put)
        qa.settle(1.0);
        return qa.report().find((r) => r.kind === k);
      }, [kind, forward] as const);
      const label = forward === null ? "configured" : "legacy-z";
      console.log(`BZFACE_REPORT ${kind} ${label} ${JSON.stringify(rep)}`);
      await shot(`${kind}-${label}`);
      if (forward === null && rep && rep.errorDeg > 10) failures.push(`${kind} drawn ${rep.errorDeg} degrees off the player (> 10)`);
    }
    // profile still: with the configured axis turned +90 degrees about Y the head must point to the camera's right
    await page.evaluate((k) => {
      const qa = (window as unknown as { __AURA_BUNKER_ZERO_QA__: Qa }).__AURA_BUNKER_ZERO_QA__;
      qa.setForward(k, null);
      qa.settle(0.6);
      qa.rotateDrawn(k, Math.PI / 2);
    }, kind);
    await shot(`${kind}-profile-head-right`);
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
