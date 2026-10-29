/**
 * Wonder World J08 (PRD 04; PRD 06 gate G2): the golden episode's first frame on remote software WebGL2 is lit, drawn
 * and error-free, with its cast and prop on stage, once with the admitted GLB models and once with `?models=0`
 * (primitive stand-ins). Remote runner only: apps/veer-wonder-world/tools/remote-run.sh first-frame
 *
 * Flow: ?autostart=1&story=sheru-big-adventure&manual=1&mode=play-together -> ready -> story on stage -> advance(1500)
 * -> canvas-only screenshot (overlays hidden, black backdrop, so a blank or transparent canvas cannot pass) -> luma,
 * draw calls, live scene nodes, zero console errors. The view the grown-up sees is printed as WWSHOT
 * first-frame-<variant>; the record as WWJSON first-frame-<variant>.
 *
 * Models variant: software WebGL2 starves the page, so a large GLB can outlast the preload's 10 s wait. The app then
 * draws that model's stand-in for this mount and keeps downloading it (src/runtime/asset-preloader.ts). When that
 * happens the spec waits for the downloads to settle, starts the story again and checks that the second mount draws
 * the models, which is the app's own path for a late model. The record keeps the first mount's state as `firstMount`.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  E17,
  SOFTWARE_GL_NOTE,
  TEST_TIMEOUT_MS,
  admittedModelKeys,
  attachPageLog,
  captureCanvas,
  captureView,
  decodePng,
  emitJson,
  emitShot,
  liveNodes,
  lumaStats,
  openWonderWorld,
  qaAdvance,
  qaDiagnostics,
  qaStartStory,
  qaState,
  readBootError,
  runContext,
  saveReportFile,
  waitFor,
  waitForStoryOnStage
} from "./wonder-world-lib";

const VIEWPORT = { width: 1024, height: 768 } as const;
/** A lit pastel meadow sits far above these; a black or cleared-only frame sits far below. */
const MIN_MEAN_LUMA = 30;
const MIN_NON_BLACK_RATIO = 0.5;
/** A frame that drew only its clear colour is flat; cast, ball and ground give real contrast. */
const MIN_LUMA_STD_DEV = 2;
const MIN_COARSE_COLOURS = 12;
/** Longer than the app's 120 s download cap, so every download has settled (or been capped) by then. */
const DOWNLOADS_SETTLED_MS = 150_000;

const VARIANTS = [
  { label: "models", models: true, title: "admitted GLB models" },
  { label: "standins", models: false, title: "?models=0 primitive stand-ins" }
] as const;

test.describe("Wonder World J08 first frame", () => {
  test.setTimeout(TEST_TIMEOUT_MS);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  for (const variant of VARIANTS) {
    test(`E17 first frame is lit, drawn and error-free with ${variant.title}`, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      const log = attachPageLog(page);
      await openWonderWorld(page, server, log, {
        autostart: 1,
        story: E17.id,
        manual: 1,
        mode: "play-together",
        ...(variant.models ? {} : { models: 0 })
      });
      await waitForStoryOnStage(page, log, E17.id);

      const admitted = admittedModelKeys();
      // Cast members whose GLB is admitted must draw as models (F0.4); a prop without a model (the ball) is a stand-in.
      const expectModel: string[] = variant.models ? E17.cast.filter((id) => admitted?.has(id) === true) : [];
      let firstMount: Record<string, unknown> | null = null;
      const lateModels = (await liveNodes(page, expectModel)).nodes.filter((node) => !node.tags.includes("model")).map((node) => node.id);
      if (lateModels.length > 0) {
        const first = await qaDiagnostics(page);
        firstMount = { standIns: lateModels, modelStatus: first?.modelStatus ?? null };
        await waitFor(page, log, "model downloads settled", DOWNLOADS_SETTLED_MS, async () => {
          const status = (await qaDiagnostics(page))?.modelStatus as Readonly<Record<string, number>> | undefined;
          return status !== undefined && !((status.pending ?? 0) > 0);
        });
        await qaStartStory(page, E17.id, "play-together");
        await waitForStoryOnStage(page, log, E17.id);
      }

      const before = await qaState(page);
      expect(before.audio.unlocked, "autostart keeps audio locked until a grown-up taps").toBe(false);
      expect(before.stage.modelsEnabled, "state().stage.modelsEnabled follows ?models").toBe(variant.models);

      await qaAdvance(page, 1_500);
      const after = await qaState(page);
      const advancedMs = (after.director?.elapsedMs ?? 0) - (before.director?.elapsedMs ?? 0);

      // The canvas alone: overlays hidden and a black backdrop, so only drawn pixels count.
      const canvasPng = await captureCanvas(page, { canvasOnly: true });
      const frame = decodePng(canvasPng);
      const luma = lumaStats(frame);
      saveReportFile(`first-frame-${variant.label}-canvas.png`, canvasPng);
      // What the grown-up sees over the canvas (captions, corner controls, any veil or transition overlay included).
      const viewLuma = lumaStats(decodePng(await captureCanvas(page, { canvasOnly: false })));
      emitShot(`first-frame-${variant.label}`, await captureView(page), "jpg");

      const diagnostics = await qaDiagnostics(page);
      const drawCalls = diagnostics?.drawCalls ?? after.stage.drawCalls;
      const nodes = await liveNodes(page, [...E17.cast, ...E17.props]);
      const bootError = await readBootError(page);

      emitJson(`first-frame-${variant.label}`, {
        ...(await runContext(page, `first-frame-${variant.label}`)),
        query: { autostart: 1, story: E17.id, manual: 1, mode: "play-together", models: variant.models ? 1 : 0 },
        advancedMs,
        director: after.director,
        stage: after.stage,
        audio: after.audio,
        luma,
        viewLuma,
        frame: { width: frame.width, height: frame.height },
        drawCalls,
        diagnostics,
        nodes,
        expectModel,
        firstMount,
        consoleErrors: log.consoleErrors,
        pageErrors: log.pageErrors,
        badResponses: log.badResponses,
        appErrors: after.errors,
        note: SOFTWARE_GL_NOTE
      });

      expect(advancedMs, "advance(1500) moves the story clock by 1500 ms in fixed steps").toBeGreaterThanOrEqual(1_400);
      expect(advancedMs, "advance(1500) moves the story clock by 1500 ms in fixed steps").toBeLessThanOrEqual(1_600);
      expect(after.screen).toBe("story");
      expect(after.storyId).toBe(E17.id);

      expect(luma.meanLuma, `canvas mean luma ${JSON.stringify(luma)}`).toBeGreaterThan(MIN_MEAN_LUMA);
      expect(luma.nonBlackRatio, `canvas non-black share ${JSON.stringify(luma)}`).toBeGreaterThan(MIN_NON_BLACK_RATIO);
      expect(luma.lumaStdDev, `canvas is not one flat fill ${JSON.stringify(luma)}`).toBeGreaterThan(MIN_LUMA_STD_DEV);
      expect(luma.coarseColours, `canvas shows more than a clear colour ${JSON.stringify(luma)}`).toBeGreaterThan(MIN_COARSE_COLOURS);
      expect(viewLuma.meanLuma, `the view over the canvas is not blacked out ${JSON.stringify(viewLuma)}`).toBeGreaterThan(MIN_MEAN_LUMA);
      expect(viewLuma.lumaStdDev, `the view over the canvas is not one flat veil ${JSON.stringify(viewLuma)}`).toBeGreaterThan(MIN_LUMA_STD_DEV);

      expect(drawCalls, "diagnostics().drawCalls after the first frames").toBeGreaterThan(0);
      expect(after.stage.drawCalls, "state().stage.drawCalls").toBeGreaterThan(0);
      expect(after.stage.nodes, "state().stage.nodes").toBeGreaterThanOrEqual(E17.cast.length + E17.props.length);

      expect(nodes.apps, "an Aura3D app is registered in __AURA3D_LIVE_APPS__").toBeGreaterThan(0);
      for (const node of nodes.nodes) {
        expect(node.exists, `scene node "${node.id}" exists`).toBe(true);
        expect(node.visible, `scene node "${node.id}" is visible`).toBe(true);
        if (variant.models) {
          if (expectModel.includes(node.id)) expect(node.tags, `"${node.id}" is drawn from its admitted GLB`).toContain("model");
        } else {
          expect(node.tags, `"${node.id}" is a primitive stand-in under ?models=0`).toContain("stand-in");
          expect(node.tags, `"${node.id}" loads no GLB under ?models=0`).not.toContain("model");
        }
      }
      if (variant.models) expect(admitted, "src/aura-assets.ts lists the admitted models").not.toBeNull();

      expect(after.micRequested, "no microphone").toBe(false);
      expect(after.errors, "state().errors").toEqual([]);
      expect(bootError, "__AURA_WONDER_WORLD_ERROR__").toBeNull();
      expect(log.pageErrors, "page errors").toEqual([]);
      expect(log.consoleErrors, "console errors").toEqual([]);
    });
  }
});
