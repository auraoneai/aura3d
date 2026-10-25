import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { HOOK, emit, hasRoad, look, open, raf } from "./gridroad-lib";

/**
 * Gridlock Courier first frames after `ready()` (docs/workflows/game-rework-prompt.md). Remote-only (tools/remote-acr/run.sh).
 *
 * The scene requests an environment HDRI that lands a while after mount. When it does, every material switches to its
 * image-based-lighting program variant at once (the diagnostics showed `programs.reused` jump from about 1,500 to 3,000), the
 * scene recompiles and draws are skipped until each program is ready, so the road came and went in frames the game believed
 * were settled. `warmPrograms` now waits for the HDRI first. `?warmenv=0` keeps the old behaviour for the evidence test.
 */
interface Sample { hdri: string; ibl: boolean; drawCalls: number; programs: number }

const sample = (page: Page): Promise<Sample> =>
  page.evaluate((hk) => {
    const d = (window as unknown as Record<string, any>)[hk].diag();
    return { hdri: String(d?.renderer?.environment?.hdriStatus ?? "none"), ibl: d?.renderer?.environment?.iblPixelBacked === true, drawCalls: Number(d?.drawCalls ?? -1), programs: Number(d?.programs?.reused ?? -1) };
  }, HOOK);

async function run(page: Page, label: string): Promise<{ samples: Sample[]; roads: boolean[] }> {
  const samples: Sample[] = [];
  const roads: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate((hk) => (window as unknown as Record<string, any>)[hk].stepFrames(1, { w: true }), HOOK);
    await raf(page, 2);
    const s = await sample(page);
    samples.push(s);
    if (i === 0 || i === 5) {
      const l = await look(page, await page.screenshot({ type: "png" }));
      roads.push(hasRoad(l));
      process.stdout.write(`@@GE ${label} i=${i} std=${l.std.toFixed(1)} road=${hasRoad(l)}\n`);
      emit(`ge-${label}-${i}-${hasRoad(l) ? "road" : "flat"}`, await page.screenshot({ type: "jpeg", quality: 78 }));
    }
    process.stdout.write(`@@GE ${label} i=${i} ${JSON.stringify(s)}\n`);
  }
  return { samples, roads };
}

test.describe("gridlock courier first frames after ready", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("with the environment wait the scene is settled when ready() resolves", async ({ browser }) => {
    const page = await open(browser, server, "?manual=1&warmenvms=600000", 1280, 720);
    const { samples, roads } = await run(page, "default");
    await page.context().close();
    expect(samples.every((s) => s.hdri !== "pending"), `HDRI landed before the game was ready: ${JSON.stringify(samples.map((s) => s.hdri))}`).toBe(true);
    expect(new Set(samples.map((s) => s.drawCalls)).size, `draw calls stay constant: ${JSON.stringify(samples.map((s) => s.drawCalls))}`).toBe(1);
    expect(roads, "the road is drawn in the first and the last sampled frame").toEqual([true, true]);
  });

  test("without it the HDRI can still be pending right after ready (evidence only)", async ({ browser }) => {
    const page = await open(browser, server, "?manual=1&warmenv=0", 1280, 720);
    const { samples } = await run(page, "warmenv0");
    process.stdout.write(`@@GESUM warmenv0 hdri=${JSON.stringify(samples.map((s) => s.hdri))} drawCalls=${JSON.stringify(samples.map((s) => s.drawCalls))} programs=${JSON.stringify(samples.map((s) => s.programs))}\n`);
    await page.context().close();
  });
});
