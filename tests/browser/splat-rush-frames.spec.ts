import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * splat-rush-frames: port-side frames at the same simulation steps as tools/crayon-capture/splat-rush-frames.ts
 * (the original), for the art-fidelity comparison. Remote only (tools/remote-acr/run.sh); never local Playwright.
 * Frames are printed as `@@SPLAT_FRAME <name> <i> <n> <base64 jpeg chunk>` (rebuild with splat-rush-frames-split.ts).
 */
const LAB = "/examples/splat-rush-port/";
const FIXTURE = "tests/browser/data/splat-rush-reference-replay.json";
const TAG = process.env.SPLAT_FRAME_TAG ?? "port";
const STEPS = (process.env.SPLAT_FRAME_STEPS ?? "40,200,500,800").split(",").map(Number);

interface Hooks {
  ready(): boolean;
  loadScript(text: string, warmup?: number): string;
  advanceScript(to: number): number;
  idleUntil(phase: string, max?: number): string;
  state(): { phase: string };
  diagnostics(): Record<string, unknown> | null;
}
type Win = Window & { __AURA_SPLAT_RUSH__: Hooks; __AURA_SPLAT_RUSH_ERROR__?: string };

function emit(name: string, jpeg: Buffer): void {
  const b64 = jpeg.toString("base64");
  const size = 1800;
  const n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SPLAT_FRAME ${name} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}\n`);
}

test.describe("splat-rush-frames", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(resolve("tests/reports/splat-rush-frames"), { recursive: true });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("port frames at the original's capture steps", async ({ page }) => {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as { script: string };
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as Win).__AURA_SPLAT_RUSH__?.ready() === true || Boolean((window as unknown as Win).__AURA_SPLAT_RUSH_ERROR__), undefined, { timeout: 240_000 });
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));
    page.on("console", (m) => { if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 160)}`); });
    const diag = async (name: string): Promise<void> => {
      const d = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH__.diagnostics());
      process.stdout.write(`@@SPLAT_DIAG ${name} ${JSON.stringify(d)}\n`);
    };
    const shot = async (name: string): Promise<void> => {
      await page.waitForTimeout(250);
      const buf = await page.screenshot({ type: "jpeg", quality: 92 });
      writeFileSync(resolve(`tests/reports/splat-rush-frames/${name}.jpg`), buf);
      emit(name, buf);
    };
    // replay pass
    await page.evaluate((text) => (window as unknown as Win).__AURA_SPLAT_RUSH__.loadScript(text), fixture.script);
    await shot(`${TAG}-replay-splash`);
    for (const s of STEPS) {
      await page.evaluate((to) => (window as unknown as Win).__AURA_SPLAT_RUSH__.advanceScript(to), s);
      await shot(`${TAG}-replay-s${String(s).padStart(4, "0")}`);
      await diag(`${TAG}-replay-s${String(s).padStart(4, "0")}`);
    }
    // idle pass: start, never steer, until game over, then let the card settle
    await page.evaluate((text) => (window as unknown as Win).__AURA_SPLAT_RUSH__.loadScript(text), fixture.script);
    const end = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH__.idleUntil("gameOver", 1500));
    process.stdout.write(`[splat-frames] port idle reached ${end}\n`);
    await shot(`${TAG}-idle-gameover`);
    process.stdout.write(`@@SPLAT_PROBLEMS ${JSON.stringify(problems)}\n`);
  });
});
