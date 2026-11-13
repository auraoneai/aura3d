/**
 * Wonder World spatial physics & choreography visual verification (remote ACR runner only).
 *
 * Captures 1024x768 WebGL key frames (`WWSHOT`) and live 3D spatial state records (`WWJSON`) across
 * doorway, barn, train, meadow, block-stack/topple, elevator-cab, and bedtime scenes:
 *   - whos-at-the-door (approach outside closed door + open doorway threshold)
 *   - family-doorbells (visitor crossing open threshold at back)
 *   - peekaboo-animal-barn (animal emerging cleanly from open barn door at back)
 *   - gogo-abc-train (GoGo & carriage aligned along station rails at y >= 0.08 m)
 *   - sheru-big-adventure (Sheru & ball grounded on meadow grass with clear gateway)
 *   - build-and-tumble (stacked tower + 90-degree toppled block contact)
 *   - little-lift (Teddy elevated inside upper-floor lift cab with cab-parented gate)
 *   - teddy-warm-blanket, tuck-in-friends, cloud-sheep-hush (bedtime mattress/cloud contact & draped blanket)
 *
 * Uses the deterministic Node director simulator (`createEpisodeDirector` + `manualLineMs`) so each story reaches its
 * target moment in ONE `qaAdvance(page, deltaMs)` call (one SwiftShader WebGL2 render per jump instead of hundreds).
 */
import { expect, test, type Page } from "@playwright/test";
import { createEpisodeDirector } from "../../apps/veer-wonder-world/src/runtime/episode-director";
import type { StageSpatialNodeState } from "../../apps/veer-wonder-world/src/scenes/stage";
import type { DirectorSnapshot, PlayMode } from "../../apps/veer-wonder-world/src/types";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  QA_GLOBAL,
  SOFTWARE_GL_NOTE,
  attachPageLog,
  authoredStory,
  captureCanvas,
  decodePng,
  emitJson,
  emitShot,
  lumaStats,
  openWonderWorld,
  pngToJpeg,
  qaAdvance,
  qaDiagnostics,
  qaStartStory,
  qaState,
  qaTap,
  readBootError,
  runContext,
  waitForStoryOnStage,
  type PageLog
} from "./wonder-world-lib";
import { STEP_MS, manualLineMs } from "./wonder-world-timeline";

const VIEWPORT = { width: 1024, height: 768 } as const;
const SUITE_TIMEOUT_MS = 45 * 60_000;

class StoryClockSim {
  private readonly director;

  constructor(storyId: string, mode: PlayMode) {
    this.director = createEpisodeDirector(authoredStory(storyId), { lineMs: manualLineMs });
    this.director.send({ type: "START", mode });
  }

  deltaUntil(predicate: (snap: DirectorSnapshot) => boolean, maxMs = 180_000): number {
    let delta = 0;
    while (delta < maxMs && !predicate(this.director.snapshot()) && this.director.snapshot().phase !== "finished") {
      this.director.send({ type: "TICK", dtMs: STEP_MS });
      delta += STEP_MS;
    }
    return delta;
  }

  advance(ms: number): number {
    const steps = Math.max(0, Math.round(ms / STEP_MS));
    for (let i = 0; i < steps; i += 1) {
      this.director.send({ type: "TICK", dtMs: STEP_MS });
    }
    return steps * STEP_MS;
  }

  tap(targetId: string): void {
    this.director.send({ type: "TAP", target: targetId });
  }
}

async function jumpUntil(
  page: Page,
  sim: StoryClockSim,
  predicate: (snap: DirectorSnapshot) => boolean,
  extraMs = 0
): Promise<Awaited<ReturnType<typeof qaState>>> {
  const delta = sim.deltaUntil(predicate) + (extraMs > 0 ? sim.advance(extraMs) : 0);
  if (delta > 0) {
    await qaAdvance(page, delta);
  }
  let state = await qaState(page);
  let fallback = 0;
  while (state.director && !predicate(state.director) && extraMs === 0 && state.director.phase !== "finished" && fallback < 4) {
    const step = sim.advance(1_000);
    await qaAdvance(page, step);
    state = await qaState(page);
    fallback += 1;
  }
  return state;
}

async function tapAndAdvance(page: Page, sim: StoryClockSim, targetId: string, afterMs: number): Promise<void> {
  const tapped = await qaTap(page, targetId);
  expect(tapped, `tap("${targetId}") accepted`).toBe(true);
  sim.tap(targetId);
  if (afterMs > 0) {
    await qaAdvance(page, sim.advance(afterMs));
  }
}

async function qaSpatialState(page: Page): Promise<readonly StageSpatialNodeState[]> {
  return page.evaluate((name) => {
    const host = window as unknown as Record<string, { spatialState?: () => readonly StageSpatialNodeState[] } | undefined>;
    const hooks = host[name];
    if (!hooks || typeof hooks.spatialState !== "function") return [];
    return hooks.spatialState();
  }, QA_GLOBAL);
}

async function captureKeyFrame(
  page: Page,
  name: string,
  storyId: string
): Promise<{ readonly spatial: readonly StageSpatialNodeState[]; readonly state: Awaited<ReturnType<typeof qaState>> }> {
  const png = await captureCanvas(page, { canvasOnly: true });
  const frame = decodePng(png);
  const luma = lumaStats(frame);
  expect(luma.meanLuma, `${name} mean luma`).toBeGreaterThan(10);
  expect(luma.nonBlackRatio, `${name} non-black ratio`).toBeGreaterThan(0.3);
  expect(luma.coarseColours, `${name} coarse colours`).toBeGreaterThan(6);
  const jpg = await pngToJpeg(page, png, 0.88);
  emitShot(name, jpg, "jpg");
  const state = await qaState(page);
  const spatial = await qaSpatialState(page);
  const diagnostics = await qaDiagnostics(page);
  emitJson(name, {
    ...(await runContext(page, name)),
    storyId,
    director: state.director,
    luma,
    drawCalls: diagnostics?.drawCalls ?? state.stage.drawCalls,
    warnings: diagnostics?.warnings ?? [],
    spatial,
    note: SOFTWARE_GL_NOTE
  });
  expect(diagnostics?.warnings ?? [], `${name} stage warnings`).toEqual([]);
  return { spatial, state };
}

test.describe("Wonder World spatial physics & WebGL key frames", () => {
  test.setTimeout(SUITE_TIMEOUT_MS);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("@core captures and verifies WebGL key frames across doorway, barn, train, meadow, blocks, and bedtime stories", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    const log: PageLog = attachPageLog(page);
    let openedPage = false;
    const mountStory = async (storyId: string, mode: PlayMode): Promise<void> => {
      if (!openedPage) {
        await openWonderWorld(page, server, log, {
          autostart: 1,
          story: storyId,
          manual: 1,
          mode
        });
        openedPage = true;
      } else {
        await qaStartStory(page, storyId, mode);
      }
      await waitForStoryOnStage(page, log, storyId);
    };

    // 1. whos-at-the-door: Momo approaches outside closed door ("who"), then knock -> door swings open -> Sheru enters cleanly ("door-invite").
    await mountStory("whos-at-the-door", "play-together");
    const e18Sim = new StoryClockSim("whos-at-the-door", "play-together");
    await jumpUntil(page, e18Sim, (s) => s.beatId === "who" && s.phase === "holding", 2_000);
    const e18Closed = await captureKeyFrame(page, "spatial-e18-door-approach", "whos-at-the-door");
    const e18Momo = e18Closed.spatial.find((n) => n.id === "momo");
    const e18Door = e18Closed.spatial.find((n) => n.id === "door");
    expect(e18Momo?.visible).toBe(true);
    expect(e18Door?.visible).toBe(true);
    expect(e18Door?.open).toBe(false);
    if (e18Momo && e18Door) {
      const dist = Math.hypot(e18Momo.position[0] - e18Door.position[0], e18Momo.position[2] - e18Door.position[2]);
      expect(dist, "Momo waits clear outside closed door").toBeGreaterThan(0.45);
    }

    await jumpUntil(page, e18Sim, (s) => s.beatId === "door-invite" && s.phase === "waiting");
    await tapAndAdvance(page, e18Sim, "door", 2_200);
    const e18Open = await captureKeyFrame(page, "spatial-e18-door-open", "whos-at-the-door");
    expect(e18Open.spatial.find((n) => n.id === "door")?.openProgress ?? 0).toBeGreaterThan(0.7);
    expect(e18Open.spatial.find((n) => n.id === "sheru")?.visible).toBe(true);

    // 2. family-doorbells: visitor enters cleanly through open doorway at back while Momo greets from frontLeft.
    await mountStory("family-doorbells", "play-together");
    const g09Sim = new StoryClockSim("family-doorbells", "play-together");
    await jumpUntil(page, g09Sim, (s) => s.beatId === "ring" && s.phase === "waiting");
    await tapAndAdvance(page, g09Sim, "door", 0);
    await jumpUntil(page, g09Sim, (s) => s.beatId === "open", 2_000);
    const g09 = await captureKeyFrame(page, "spatial-g09-family-doorbells", "family-doorbells");
    expect(g09.spatial.find((n) => n.id === "door")?.open).toBe(true);
    expect(g09.spatial.find((n) => n.id === "lulu")?.visible).toBe(true);

    // 3. peekaboo-animal-barn: barn door open at back, cow stepped out cleanly onto center.
    await mountStory("peekaboo-animal-barn", "play-together");
    const g04Sim = new StoryClockSim("peekaboo-animal-barn", "play-together");
    await jumpUntil(page, g04Sim, (s) => s.phase === "waiting");
    await tapAndAdvance(page, g04Sim, "door", 2_400);
    const g04 = await captureKeyFrame(page, "spatial-g04-peekaboo-barn", "peekaboo-animal-barn");
    expect(g04.spatial.find((n) => n.id === "cow")?.visible).toBe(true);

    // 4. gogo-abc-train: GoGo & carriage aligned on station rails at y >= 0.08 m.
    await mountStory("gogo-abc-train", "play-together");
    await qaAdvance(page, 3_500);
    const e04 = await captureKeyFrame(page, "spatial-e04-gogo-abc-train", "gogo-abc-train");
    const e04Gogo = e04.spatial.find((n) => n.id === "gogo");
    expect(e04Gogo?.position[1] ?? 0, "GoGo wheels rest on station rail top").toBeGreaterThanOrEqual(0.075);

    // 5. sheru-big-adventure: meadow grass contact & clear entry gateway.
    await mountStory("sheru-big-adventure", "play-together");
    await qaAdvance(page, 3_500);
    const e17 = await captureKeyFrame(page, "spatial-e17-sheru-adventure", "sheru-big-adventure");
    const e17Sheru = e17.spatial.find((n) => n.id === "sheru");
    expect(e17Sheru?.position[1] ?? -1).toBeGreaterThanOrEqual(-0.01);

    // 6. build-and-tumble: stacked blocks at center, then 90-degree topple onto floor.
    await mountStory("build-and-tumble", "play-together");
    const g08Sim = new StoryClockSim("build-and-tumble", "play-together");
    await jumpUntil(page, g08Sim, (s) => s.beatId === "one" && s.phase === "waiting");
    await tapAndAdvance(page, g08Sim, "block-1", 0);
    await jumpUntil(page, g08Sim, (s) => s.beatId === "two" && s.phase === "waiting");
    await tapAndAdvance(page, g08Sim, "block-2", 1_500);
    await captureKeyFrame(page, "spatial-g08-blocks-stacked", "build-and-tumble");

    await jumpUntil(page, g08Sim, (s) => s.beatId === "three" && s.phase === "waiting");
    await tapAndAdvance(page, g08Sim, "block-3", 1_800);
    const g08Toppled = await captureKeyFrame(page, "spatial-g08-blocks-toppled", "build-and-tumble");
    expect(g08Toppled.spatial.some((n) => n.id.startsWith("block") && n.toppled)).toBe(true);

    // 7. Bedtime scenes: teddy-warm-blanket, tuck-in-friends, cloud-sheep-hush.
    await mountStory("teddy-warm-blanket", "watch-sing");
    await qaAdvance(page, 6_000);
    await captureKeyFrame(page, "spatial-e22-teddy-blanket", "teddy-warm-blanket");

    await mountStory("tuck-in-friends", "play-together");
    const g13Sim = new StoryClockSim("tuck-in-friends", "play-together");
    const g13Wait = await jumpUntil(page, g13Sim, (s) => s.phase === "waiting");
    const g13Target = g13Wait.targets[0];
    expect(g13Target, "tuck-in-friends waiting target").toBeTruthy();
    if (g13Target) await tapAndAdvance(page, g13Sim, g13Target, 2_200);
    const g13 = await captureKeyFrame(page, "spatial-g13-tuck-in-friends", "tuck-in-friends");
    const g13Teddy = g13.spatial.find((n) => n.id === "teddy");
    expect(g13Teddy?.position[1] ?? 0, "Teddy rests on top of bed mattress").toBeGreaterThan(0.2);

    await mountStory("cloud-sheep-hush", "play-together");
    const g16Sim = new StoryClockSim("cloud-sheep-hush", "play-together");
    const g16Wait = await jumpUntil(page, g16Sim, (s) => s.phase === "waiting");
    const g16Target = g16Wait.targets[0];
    expect(g16Target, "cloud-sheep-hush waiting target").toBeTruthy();
    if (g16Target) await tapAndAdvance(page, g16Sim, g16Target, 2_200);
    const g16 = await captureKeyFrame(page, "spatial-g16-cloud-sheep-hush", "cloud-sheep-hush");
    const g16Sheep = g16.spatial.find((n) => n.id === "sheepOne");
    expect(g16Sheep?.position[1] ?? 0, "Sheep rests on top of sleepy cloud").toBeGreaterThan(0.2);

    expect(log.consoleErrors, "console errors").toEqual([]);
    expect(log.pageErrors, "page errors").toEqual([]);
    expect(log.badResponses, "HTTP >= 400 responses").toEqual([]);
    expect(await readBootError(page), "boot error").toBeNull();
  });

  test("@g07 captures and verifies little-lift cab floor rider sync and gate closing", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    const log: PageLog = attachPageLog(page);
    await openWonderWorld(page, server, log, {
      autostart: 1,
      story: "little-lift",
      manual: 1,
      mode: "play-together"
    });
    await waitForStoryOnStage(page, log, "little-lift");
    const g07Sim = new StoryClockSim("little-lift", "play-together");
    await jumpUntil(page, g07Sim, (s) => s.beatId === "in" && s.phase === "waiting");
    await tapAndAdvance(page, g07Sim, "teddy", 0);
    await jumpUntil(page, g07Sim, (s) => s.beatId === "up" && s.phase === "waiting");
    await tapAndAdvance(page, g07Sim, "lift", 2_200);
    const g07 = await captureKeyFrame(page, "spatial-g07-little-lift-up", "little-lift");
    const g07Teddy = g07.spatial.find((n) => n.id === "teddy");
    const g07Lift = g07.spatial.find((n) => n.id === "lift");
    expect(g07Teddy?.position[1] ?? 0, "Teddy rides elevated lift cab floor").toBeGreaterThan(0.8);
    expect(g07Teddy?.position[1] ?? 99, "Teddy stays inside lift cab below roof").toBeLessThan(0.95);
    expect(g07Lift?.open, "Lift gate closes cleanly before ascending").toBe(false);

    expect(log.consoleErrors, "console errors").toEqual([]);
    expect(log.pageErrors, "page errors").toEqual([]);
    expect(log.badResponses, "HTTP >= 400 responses").toEqual([]);
    expect(await readBootError(page), "boot error").toBeNull();
  });
});
