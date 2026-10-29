/**
 * Wonder World look-dev captures (PRD 02 section 4; .claude/skills/aura3d-art-direction): one opening frame of each of
 * the six worlds, at desktop 1024x768 and phone portrait 390x844, drawn with the admitted models. Each frame is the
 * canvas alone (overlays hidden), printed as WWSHOT look-<world>-<viewport>; the record WWJSON look-<world> carries the
 * luma and colour numbers the look-dev loop compares between rounds (mean luma, saturation, colourfulness, clipped
 * share, 5th/95th percentile luma). It asserts only that each frame is drawn and error-free: judging the look is the
 * loop's job, not a pass/fail gate. Remote runner only: apps/veer-wonder-world/tools/remote-run.sh look
 *
 * One page loads the six stories in turn (`startStory`, Watch & Sing, manual clock) and advances each by 4 s, so the
 * cast has walked in for the opening wide shot. `?modelWaitMs=180000` lets each load wait for its models (software
 * WebGL2 slows the downloads past the default 10 s wait), so no story needs a second mount.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  SOFTWARE_GL_NOTE,
  attachPageLog,
  captureCanvas,
  captureCanvasJpeg,
  colourStats,
  decodePng,
  emitJson,
  emitShot,
  lumaStats,
  openWonderWorld,
  qaAdvance,
  qaStartStory,
  qaState,
  readBootError,
  remountIfModelsLate,
  runContext,
  waitForStoryOnStage
} from "./wonder-world-lib";

const DESKTOP = { width: 1024, height: 768 } as const;
const PHONE = { width: 390, height: 844 } as const;
/** Story time after the start, so the opening entrances are done. */
const OPENING_MS = 4_000;
/** Real time for the stage to re-frame and draw after a viewport change. */
const RESIZE_SETTLE_MS = 3_000;
/** The preload wait for each story's models (`?modelWaitMs`). */
const MODEL_WAIT_MS = 180_000;

/** One story per world, each with the cast its opening shows. */
const WORLD_SHOTS = [
  { world: "meadow", story: "sheru-big-adventure", cast: ["momo", "sheru"] },
  { world: "music-garden", story: "lulu-dino-dance", cast: ["lulu", "momo"] },
  { world: "peekaboo-barn", story: "peekaboo-palace", cast: ["momo", "peeko"] },
  { world: "station", story: "gogo-train", cast: ["gogo", "peeko"] },
  { world: "learning-cloud", story: "alphabet-zoo", cast: ["lumi", "peeko"] },
  { world: "home-nook", story: "momo-magic-mouth", cast: ["momo"] }
] as const;

test.describe("Wonder World look-dev captures", () => {
  test.setTimeout(55 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("the six worlds' opening frames, desktop and phone", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const log = attachPageLog(page);
    const first = WORLD_SHOTS[0];
    await openWonderWorld(page, server, log, { autostart: 1, story: first.story, manual: 1, mode: "watch-sing", modelWaitMs: MODEL_WAIT_MS });
    const records: Record<string, unknown>[] = [];
    for (const shot of WORLD_SHOTS) {
      await page.setViewportSize(DESKTOP);
      if (shot !== first) await qaStartStory(page, shot.story, "watch-sing");
      await waitForStoryOnStage(page, log, shot.story);
      const firstMount = await remountIfModelsLate(page, log, shot.story, "watch-sing", shot.cast);
      await qaAdvance(page, OPENING_MS);
      const frames: Record<string, unknown> = {};
      for (const [label, viewport] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
        if (label === "phone") {
          await page.setViewportSize(viewport);
          await page.waitForTimeout(RESIZE_SETTLE_MS);
          await qaAdvance(page, 100);
        }
        const png = decodePng(await captureCanvas(page, { canvasOnly: true }));
        frames[label] = { viewport, luma: lumaStats(png), colour: colourStats(png) };
        emitShot(`look-${shot.world}-${label}`, await captureCanvasJpeg(page), "jpg");
      }
      const state = await qaState(page);
      const record = {
        ...(await runContext(page, `look-${shot.world}`)),
        world: shot.world,
        story: shot.story,
        openingMs: OPENING_MS,
        firstMount,
        director: state.director,
        frames,
        note: SOFTWARE_GL_NOTE
      };
      emitJson(`look-${shot.world}`, record);
      records.push(record);
      expect(state.storyId, `${shot.world}: the story is on stage`).toBe(shot.story);
      for (const label of ["desktop", "phone"] as const) {
        const frame = frames[label] as { luma: { nonBlackRatio: number; coarseColours: number } };
        expect(frame.luma.nonBlackRatio, `${shot.world} ${label}: drawn, not black`).toBeGreaterThan(0.5);
        expect(frame.luma.coarseColours, `${shot.world} ${label}: more than a clear colour`).toBeGreaterThan(12);
      }
    }
    emitJson("look-summary", {
      worlds: records.map((record) => ({ world: record["world"], frames: record["frames"] }))
    });
    expect(await readBootError(page), "__AURA_WONDER_WORLD_ERROR__").toBeNull();
    expect(log.pageErrors, "page errors").toEqual([]);
    expect(log.consoleErrors, "console errors").toEqual([]);
  });
});
