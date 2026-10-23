import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { test, type Page } from "@playwright/test";

/**
 * Apex Overdrive look comparison: the previous build (third-party engine bundle driving the scene) against the native-simulation build.
 * Remote only (tools/remote-acr/run.sh). Both production routes are built with tests/support/rr-smoke.vite.config.ts and staged into
 * tests/support/rr-dist (native) and tests/support/rr-dist-prev (previous build, which also carries its public/roadster-rush files).
 * Each page is driven through the same deterministic script (fixed seed, manual stepping, identical actions: the simulations are
 * step-for-step identical, see tests/unit/roadster-rush-native) and 1280x720 frames are printed as `RRF <build> <name> <i> <n> <base64 jpeg>`.
 */

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".json": "application/json", ".hdr": "application/octet-stream", ".cjs": "text/javascript", ".mp3": "audio/mpeg" };
const BUILDS = [
  { name: "native", dist: resolve("tests/support/rr-dist") },
  { name: "previous", dist: resolve("tests/support/rr-dist-prev") }
];

async function serve(page: Page, dist: string): Promise<void> {
  await page.route("http://rr.local/**", async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const rel = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    for (const root of [dist, resolve("public")]) {
      const file = resolve(root, `.${rel}`);
      if (file.startsWith(root) && existsSync(file)) return route.fulfill({ contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) });
    }
    if (/\.css$/.test(pathname)) return route.fulfill({ contentType: "text/css", body: "" });
    return route.fulfill({ status: 404, body: "" });
  });
}

async function shot(page: Page, build: string, name: string): Promise<void> {
  const before = await page.evaluate(() => (window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } }).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0);
  await page.evaluate(() => (window as unknown as { __AURA3D_SHOWCASE_ROADSTER_RUSH__: { app: { step(dt: number): void } } }).__AURA3D_SHOWCASE_ROADSTER_RUSH__.app.step(1 / 60));
  await page.waitForFunction((n) => ((window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } }).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= n + 3, before, { timeout: 5 * 60_000, polling: 250 });
  await page.waitForTimeout(400);
  const jpeg = await page.screenshot({ type: "jpeg", quality: 84 });
  const b64 = jpeg.toString("base64");
  const total = Math.ceil(b64.length / 3500);
  for (let i = 0; i < total; i++) console.log(`RRF ${build} ${name} ${i} ${total} ${b64.slice(i * 3500, (i + 1) * 3500)}`);
  console.log(`RRF_DONE ${build} ${name} bytes=${jpeg.length}`);
}

for (const build of BUILDS) {
  test(`apex overdrive frames: ${build.name}`, async ({ page }) => {
    test.setTimeout(40 * 60_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
    await serve(page, build.dist);
    await page.goto("http://rr.local/apps/showcase-roadster-rush/?seed=42");
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 20 * 60_000, polling: 1000 });
    // Hold the sim still (manual stepping) and restart the run so both builds are at identical, deterministic state.
    await page.evaluate(() => {
      const g = (window as unknown as { __GAME__: { game: Record<string, unknown> & { manual: boolean; mode: string; start(): void } } }).__GAME__.game;
      g.manual = true;
      g.mode = "title";
      g.start();
      g.manual = true;
    });
    const run = (steps: number, shieldEvery = 0) =>
      page.evaluate(
        ({ steps, shieldEvery }) => {
          const g = (window as unknown as { __GAME__: { game: { simStep(dt: number): void; manual: boolean; triggerAction(a: string, o?: unknown): unknown; player: { shieldTimer: number } } } }).__GAME__.game;
          g.manual = true;
          for (let i = 0; i < steps; i++) {
            if (shieldEvery && i % shieldEvery === 0) g.triggerAction("pickup", { kind: "shield" });
            g.simStep(1 / 60);
          }
          g.manual = true;
        },
        { steps, shieldEvery }
      );
    const act = (action: string, options?: unknown) =>
      page.evaluate(
        ({ action, options }) => {
          const g = (window as unknown as { __GAME__: { game: { manual: boolean; triggerAction(a: string, o?: unknown): unknown } } }).__GAME__.game;
          g.triggerAction(action, options);
          g.manual = true;
        },
        { action, options }
      );
    const scenario = (name: string) =>
      page.evaluate((name) => {
        const w = window as unknown as { __AURA3D_SHOWCASE_ROADSTER_RUSH__: { triggerScenario(n: string): void }; __GAME__: { game: { manual: boolean; triggerAction(a: string, o?: unknown): unknown } } };
        w.__GAME__.game.triggerAction("pickup", { kind: "shield" });
        w.__AURA3D_SHOWCASE_ROADSTER_RUSH__.triggerScenario(name);
        w.__GAME__.game.manual = true;
      }, name);
    const tod = (value: number) =>
      page.evaluate((value) => {
        const g = (window as unknown as { __GAME__: { game: { world: { setTimeOfDay(v: number): void } } } }).__GAME__.game;
        g.world.setTimeOfDay(value);
      }, value);

    await shot(page, build.name, "01-start-grid");
    await act("pickup", { kind: "shield" });
    await run(420, 300);
    await shot(page, build.name, "02-cruise");
    await act("rollRight");
    await run(14);
    await shot(page, build.name, "03-barrel-roll");
    await run(40);
    await act("thrustHold", { duration: 1.2 });
    await run(55);
    await shot(page, build.name, "04-thrust-flight");
    await run(120, 60);
    await scenario("ramp");
    await run(150, 60);
    await shot(page, build.name, "05-ramp-launch");
    await scenario("sky");
    await run(90, 60);
    await shot(page, build.name, "06-sky-lane");
    await run(3600, 300);
    await shot(page, build.name, "07-high-traffic");
    await tod(0.5);
    await run(2, 0);
    await shot(page, build.name, "08-dusk");
    await tod(1);
    await run(2, 0);
    await shot(page, build.name, "09-night");
    await tod(0);
    await page.evaluate(() => {
      const g = (window as unknown as { __GAME__: { game: { player: { shieldTimer: number; graceTimer: number; rocketTimer: number; _rollIframe: number } } } }).__GAME__.game;
      g.player.shieldTimer = 0;
      g.player.graceTimer = 0;
      g.player.rocketTimer = 0;
      g.player._rollIframe = 0;
    });
    await act("crash");
    await run(26, 0);
    await shot(page, build.name, "10-crash");
    console.log(`RRF_ERRORS ${build.name} ${JSON.stringify(errors.slice(0, 5))}`);
  });
}
