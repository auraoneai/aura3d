import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { raf, say, settleTextures, shoot, waitReady, type Cfg } from "./finc-lib";

/**
 * Duneglide art review: one settled page, static camera poses across chapter 0 plus chase frames along the ride.
 * Frames are emitted in the finc format (`@@SC`, decode with tools/shots/decode-finc.mjs). Remote only (software WebGL2).
 */
const CFG: Cfg = {
  id: "silt", slug: "silt-and-signal", base: "/examples/silt-and-signal-port/", hook: "__AURA_SILT__", desktop: [1280, 720], mobile: [390, 844],
  titleQuery: "?quality=low", playQuery: "?manual=1&start=1&chapter=0&objective=1", pump: "api.render();", settle: true, cardUpTo: "key-boost", steps: []
};
const FLY = { throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false };
const FLYB = { throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false };
type Pose = { position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fov: number };
const P = (position: [number, number, number], target: [number, number, number], fov = 62): Pose => ({ position, target, up: [0, 1, 0], fov });
const STATIC: Array<[string, Pose]> = [
  ["village", P([96, 14, 40], [128, 8, -60])],
  ["aqueduct", P([150, 20, -40], [225, 34, -130])],
  ["aqueduct-low", P([120, 8, -330], [225, 14, -420])],
  ["canal", P([40, 7, -260], [8, 0, -330])],
  ["gatehouse", P([20, 14, -190], [-34, 10, -262])],
  ["cliffs", P([-60, 30, -900], [-160, 40, -1000])],
  ["canyon-gate", P([0, 14, -1180], [0, 12, -1295])],
  ["overview", P([60, 240, -140], [100, 0, -330])],
  ["horizon", P([0, 60, 40], [0, 80, -1500], 70)]
];

test.describe("p1dune review", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("static poses and the ride", async ({ browser }) => {
    const errors: string[] = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    await page.goto(`${server.origin}${CFG.base}${CFG.playQuery}`, { waitUntil: "domcontentloaded" });
    const ready = await waitReady(page, CFG.hook, 1_500_000);
    say("SCSTATE", CFG.slug, { state: "play-ready", ready });
    expect(ready).toBe(true);
    await settleTextures(page, CFG, "1280x720", 900_000);
    const api = (body: string, arg?: unknown) => page.evaluate(({ b, a }) => { const x = (window as unknown as { __AURA_SILT__: Record<string, (...v: unknown[]) => unknown> }).__AURA_SILT__; return new Function("api", "arg", b)(x, a); }, { b: body, a: arg });
    for (const [name, pose] of STATIC) {
      await api("api.pose(arg); api.render(); api.render();", pose);
      await raf(page, 3);
      await shoot(page, CFG.slug, "1280x720", `p-${name}`);
    }
    await api("api.pose(null); api.render();");
    for (const [name, steps, input] of [["ride-a", 120, FLYB], ["ride-b", 360, FLY], ["ride-c", 480, FLY], ["ride-d", 600, FLYB], ["ride-e", 600, FLY]] as const) {
      await api("api.stepFrames(arg.n, arg.input); api.render(); api.render();", { n: steps, input });
      await raf(page, 3);
      await shoot(page, CFG.slug, "1280x720", name);
      say("SCSTATE", CFG.slug, { state: name, info: await api("return api.info();") });
    }
    say("SCERRORS", CFG.slug, { errors: errors.slice(0, 12) });
    await page.close();
  });
});
