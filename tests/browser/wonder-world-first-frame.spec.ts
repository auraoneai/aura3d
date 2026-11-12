/**
 * Wonder World J08 (PRD 04; PRD 06 gate G2; PRD 5.5.1 §3.5): the golden episode's first frame on remote software
 * WebGL2 is lit, drawn and error-free on Frame 0 from synchronous procedural craft rigs (both default backend=auto
 * and explicit ?backend=webgl2), plus the ?diag=1 safety-net overlay check.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  E17,
  SOFTWARE_GL_NOTE,
  TEST_TIMEOUT_MS,
  attachPageLog,
  captureCanvas,
  captureView,
  decodePng,
  emitJson,
  emitShot,
  liveNodes,
  lumaStats,
  openWonderWorld,
  proceduralModelKeys,
  qaAdvance,
  qaDiagnostics,
  qaState,
  readBootError,
  redact,
  runContext,
  saveReportFile,
  waitForStoryOnStage
} from "./wonder-world-lib";

const VIEWPORT = { width: 1024, height: 768 } as const;
const MIN_MEAN_LUMA = 30;
const MIN_NON_BLACK_RATIO = 0.5;
const MIN_LUMA_STD_DEV = 2;
const MIN_COARSE_COLOURS = 12;

const VARIANTS = [
  { label: "auto", backend: undefined, title: "procedural craft rigs (default backend)" },
  { label: "webgl2", backend: "webgl2" as const, title: "procedural craft rigs (?backend=webgl2)" }
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
        ...(variant.backend ? { backend: variant.backend } : {})
      });
      await waitForStoryOnStage(page, log, E17.id);

      const procedural = proceduralModelKeys();
      const before = await qaState(page);
      expect(before.audio.unlocked, "autostart keeps audio locked until a grown-up taps").toBe(false);
      expect(before.stage.proceduralNodes, "state().stage.proceduralNodes > 0").toBeGreaterThanOrEqual(
        E17.cast.length + E17.props.length
      );

      await qaAdvance(page, 1_500);
      const after = await qaState(page);
      const advancedMs = (after.director?.elapsedMs ?? 0) - (before.director?.elapsedMs ?? 0);

      const canvasPng = await captureCanvas(page, { canvasOnly: true });
      const frame = decodePng(canvasPng);
      const luma = lumaStats(frame);
      saveReportFile(`first-frame-${variant.label}-canvas.png`, canvasPng);
      const viewLuma = lumaStats(decodePng(await captureCanvas(page, { canvasOnly: false })));
      emitShot(`first-frame-${variant.label}`, await captureView(page), "jpg");

      const diagnostics = await qaDiagnostics(page);
      const drawCalls = diagnostics?.drawCalls ?? after.stage.drawCalls;
      const nodes = await liveNodes(page, [...E17.cast, ...E17.props]);
      const bootError = await readBootError(page);

      emitJson(`first-frame-${variant.label}`, {
        ...(await runContext(page, `first-frame-${variant.label}`)),
        query: { autostart: 1, story: E17.id, manual: 1, mode: "play-together", ...(variant.backend ? { backend: variant.backend } : {}) },
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
        consoleErrors: log.consoleErrors,
        pageErrors: log.pageErrors,
        badResponses: log.badResponses,
        appErrors: after.errors,
        note: SOFTWARE_GL_NOTE
      });

      expect(advancedMs).toBeGreaterThanOrEqual(1_400);
      expect(advancedMs).toBeLessThanOrEqual(1_600);
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
        expect(node.tags, `"${node.id}" is drawn from its procedural craft rig`).toContain("procedural");
      }
      expect(procedural, "src/aura-assets.ts lists the procedural rigs").not.toBeNull();
      expect(procedural?.size).toBe(65);

      expect(after.micRequested, "no microphone").toBe(false);
      expect(after.errors, "state().errors").toEqual([]);
      expect(bootError, "__AURA_WONDER_WORLD_ERROR__").toBeNull();
      expect(log.pageErrors, "page errors").toEqual([]);
      expect(log.consoleErrors, "console errors").toEqual([]);
    });
  }

  test("?diag=1 shows the diagnostics panel with the renderer string and no captured error", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    const log = attachPageLog(page);
    const query = { autostart: 1, story: E17.id, manual: 1, mode: "play-together", diag: 1 } as const;
    await openWonderWorld(page, server, log, query);
    await waitForStoryOnStage(page, log, E17.id);
    const panel = page.locator("[data-aura3d-safety-panel]");
    await expect(panel, "the ?diag=1 panel is shown").toBeVisible();
    const text = (await panel.textContent()) ?? "";
    emitShot("first-frame-diag", await captureView(page), "jpg");
    emitJson("first-frame-diag", {
      ...(await runContext(page, "first-frame-diag")),
      query,
      panel: redact(text),
      consoleErrors: log.consoleErrors,
      pageErrors: log.pageErrors
    });
    expect(text, "the panel names the GPU renderer").toMatch(/gpu: \S/);
    expect(text, "the panel shows the engine section").toMatch(/engine: \S/);
    expect(text, "the panel captured no error").toContain("no errors captured");
    expect(text).not.toMatch(/SHADER|PROGRAM LINK FAILED|WEBGL CONTEXT LOST|uncaught:|rejection:/);
    expect(await readBootError(page), "__AURA_WONDER_WORLD_ERROR__").toBeNull();
    expect(log.pageErrors, "page errors").toEqual([]);
    expect(log.consoleErrors, "console errors").toEqual([]);
  });
});
