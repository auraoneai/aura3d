import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { HOOK, emit, hasRoad, look, open, raf } from "./gridroad-lib";

/**
 * Gridlock Courier texture upgrades after `ready()` (docs/audit/game-leftovers.md, road flip). Remote-only (tools/remote-acr/run.sh).
 * A material that gains its texture switches to a textured program variant that compiles asynchronously, so the road can drop out of
 * frames the game believed were settled. `warmPrograms` now waits for pending upgrades; `?warmtex=0` keeps the old behaviour for the
 * evidence test. `@@GX <label> i=<frame> <json>` rows carry the texture status, draw calls and road presence per frame.
 */
interface Sample { pending: number; textured: number; roadNode: string; drawCalls: number; hdri: string }

const sample = (page: Page): Promise<Sample> =>
  page.evaluate((hk) => {
    const api = (window as unknown as Record<string, any>)[hk];
    const t = api.textures();
    const d = api.diag();
    return { pending: Number(t.pending), textured: Number(t.textured), roadNode: String(t.byNode?.["road-tiles"] ?? "none"), drawCalls: Number(d?.drawCalls ?? -1), hdri: String(d?.renderer?.environment?.hdriStatus ?? "none") };
  }, HOOK);

async function run(page: Page, label: string): Promise<{ samples: Sample[]; roads: boolean[] }> {
  const samples: Sample[] = [];
  const roads: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate((hk) => (window as unknown as Record<string, any>)[hk].stepFrames(1, { w: true }), HOOK);
    await raf(page, 2);
    const s = await sample(page);
    samples.push(s);
    const l = await look(page, await page.screenshot({ type: "png" }));
    roads.push(hasRoad(l));
    process.stdout.write(`@@GX ${label} i=${i} ${JSON.stringify({ ...s, std: Number(l.std.toFixed(1)), road: hasRoad(l) })}\n`);
    if (i === 0 || i === 5) emit(`gx-${label}-${i}`, await page.screenshot({ type: "jpeg", quality: 80 }));
  }
  return { samples, roads };
}

test.describe("gridlock courier texture upgrades after ready", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("with the texture wait nothing is pending when ready() resolves and the road is in every frame", async ({ browser }) => {
    const page = await open(browser, server, "?manual=1&warmenvms=600000", 1280, 720);
    const { samples, roads } = await run(page, "default");
    await page.context().close();
    expect(samples.every((s) => s.pending === 0), `no pending texture upgrade after ready: ${JSON.stringify(samples.map((s) => s.pending))}`).toBe(true);
    expect(new Set(samples.map((s) => s.drawCalls)).size, `draw calls stay constant: ${JSON.stringify(samples.map((s) => s.drawCalls))}`).toBe(1);
    expect(roads.every(Boolean), `road in every frame ${JSON.stringify(roads)}`).toBe(true);
  });

  test("without it upgrades can still be pending right after ready (evidence only)", async ({ browser }) => {
    const page = await open(browser, server, "?manual=1&warmtex=0&warmenvms=600000", 1280, 720);
    const { samples, roads } = await run(page, "warmtex0");
    process.stdout.write(`@@GXSUM warmtex0 pending=${JSON.stringify(samples.map((s) => s.pending))} drawCalls=${JSON.stringify(samples.map((s) => s.drawCalls))} roads=${JSON.stringify(roads)}\n`);
    await page.context().close();
  });
});
