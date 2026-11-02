import { createHash } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createModelMatrix } from "../../../packages/engine/src/agent-api/sceneMath";
import { accessor, readGlb } from "../../../tools/aura-fc/glb.mjs";
import { fullTimeOrbitPose } from "../../../apps/showcase-aura-fc-3d/src/game/camera";
import { MAIN_FLOOD_TOWER } from "../../../apps/showcase-aura-fc-3d/src/game/look";
import { matrixBox, headTriangleMask, compareHeadControl, type PixelRect } from "../../../apps/showcase-aura-fc-3d/src/game/qaFloodEvidence";
import type { QaCrop, V3 } from "../../../apps/showcase-aura-fc-3d/src/game/qaCrops";
import { glMetaInPage, type GlMetaResult } from "../game-luma-stats";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Remote ACR only. Example, when remote execution is authorized:
 *
 *   CONTEXT_PROFILE=full EXTRA_DIRS=apps/showcase-aura-fc-3d KEEP_IMAGE=0 \
 *     SPECS=tests/browser/gu47/fc-flood-crop-sync.spec.ts tools/remote-acr/run.sh
 *
 * Separate diagnostic shot, NOT a replacement for the 25s/60s kickoff shots:
 * freeze the seeded CPU match, step it to full time, and use the existing
 * reduced-motion full-time orbit. The diagnostic cancels only the demo's
 * 3.8s restart timer while the held frame is captured. A page screenshot is
 * taken before any scene mutation. As a visibility control only, hide the
 * existing pylon, present an off frame, then restore and present it again.
 * A shadow-disabled on/off/on control rejects changes caused only by a
 * pylon-cast shadow on an occluder. Only stable differences within projected GLB head triangles count;
 * a flare or a projected box alone cannot establish a visible pylon head.
 *
 * Every lossless PNG is attached AND chunked into the ACR log. No crop, p95,
 * screenshot or passing observation is fabricated if a diagnostic is missing.
 */
const VENUES = ["munich", "kyoto", "favela", "glacier"] as const;
const P95_MIN = 230; // evidence/game-upgrades-47/aura-fc-3d/luma-bands.json (unchanged)
const GLB = "public/aura-assets/fcFloodlightPylonMeshy.636dc3fc.glb";
const CHUNK = 16_000;
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

type Camera = { position?: unknown; target?: unknown; fov?: unknown; up?: unknown; roll?: unknown; mode?: unknown };
type G = typeof globalThis & {
  __AURA3D_LIVE_APPS__?: { all?: () => any[] };
  __AURA_AURA_FC_3D__?: { ready?: () => boolean; freeze?: (on: boolean) => void; step?: (n: number) => void; state?: () => any };
  __AURA_QA__?: { crops?: unknown };
  __AURA3D_GAME_EVIDENCE__?: any;
  __AURA_FC_SETTLED__?: boolean;
};

/** Self-contained: Playwright serializes this function into the page. */
function snapshotInPage() {
  const g = globalThis as G;
  const apps = g.__AURA3D_LIVE_APPS__?.all?.() ?? [];
  const app = apps.length === 1 ? apps[0] : undefined;
  const hook = g.__AURA_AURA_FC_3D__;
  const game = g.__AURA3D_GAME_EVIDENCE__;
  const nodeList = app?.scene?.nodes;
  const nodes = Array.isArray(nodeList) ? nodeList : [];
  const pylon = nodes.find((n: any) => n.name === "flood-0" && n.kind === "model");
  const spots = nodes.filter((n: any) => /^flood-spot-[0-3]$/.test(n.name ?? ""))
    .map((n: any) => ({ name: n.name, position: n.position }));
  const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
  const rect = canvas?.getBoundingClientRect();
  let crops: unknown = null, presented: Camera | null = null, cameraEvidence: any = null, diagnostic: any = null;
  let error: string | null = null;
  try {
    const raw = g.__AURA_QA__?.crops;
    crops = typeof raw === "function" ? raw() : raw;
    presented = app?.camera?.presented?.() ?? null;
    cameraEvidence = app?.camera?.evidence?.() ?? null;
    diagnostic = app?.diagnostics?.() ?? null;
  } catch (e) {
    error = String(e);
  }
  const textures = diagnostic?.renderer?.runtime?.texturedMaterials;
  return {
    appCount: apps.length,
    methods: { pause: typeof app?.pause === "function", advance: typeof app?.advance === "function",
      step: typeof app?.step === "function", screenshot: typeof app?.screenshot === "function",
      freeze: typeof hook?.freeze === "function", simStep: typeof hook?.step === "function" },
    ready: hook?.ready?.() ?? false,
    settled: g.__AURA_FC_SETTLED__ === true,
    state: hook?.state?.() ?? null,
    runtime: app?.runtime ?? null,
    game: game ? { ready: game.ready, route: game.route, venue: game.venue, mode: game.mode, phase: game.phase,
      cameraMode: game.cameraMode, camera: game.camera, framesRendered: game.framesRendered, lookMode: game.lookMode } : null,
    crops,
    presented,
    sceneCamera: app?.scene?.camera ?? null,
    rig: cameraEvidence?.rig ?? null,
    viewProjection: cameraEvidence?.viewProjection ?? null,
    pylon: pylon ? { kind: pylon.kind, name: pylon.name, position: pylon.position, rotation: pylon.rotation,
      scale: pylon.scale, targetHeight: pylon.targetHeight, visible: pylon.visible, castShadow: pylon.castShadow, asset: pylon.asset } : null,
    spots,
    canvas: canvas && rect ? { x: rect.x, y: rect.y, rectWidth: rect.width, rectHeight: rect.height,
      clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight, width: canvas.width, height: canvas.height } : null,
    diagnostics: diagnostic ? { backend: diagnostic.backend, drawCalls: diagnostic.drawCalls,
      errors: diagnostic.errors ?? null, texTotal: Array.isArray(textures) ? textures.length : null,
      texPending: Array.isArray(textures) ? textures.filter((t: any) => t.status === "pending").length : null } : null,
    error
  };
}
type Snapshot = ReturnType<typeof snapshotInPage>;

const vector = (v: unknown): v is V3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const near = (a: readonly number[], b: readonly number[], eps = 1e-6): boolean =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) <= eps);
const cropValues = (c: QaCrop) => [c.x, c.y, c.w, c.h];

/** Excludes draw calls and pylon control fields, which intentionally change in the control. */
function heldFields(s: Snapshot) {
  return { state: s.state, runtime: s.runtime, game: s.game, crops: s.crops, presented: s.presented,
    sceneCamera: s.sceneCamera, rig: s.rig, viewProjection: s.viewProjection, spots: s.spots, canvas: s.canvas,
    pylon: s.pylon ? { ...s.pylon, visible: undefined, castShadow: undefined } : null };
}

function validateFrame(s: Snapshot, after: Snapshot, meta: GlMetaResult, venue: string) {
  const problems: string[] = [];
  const pose = s.presented;
  const camera = s.sceneCamera as Camera | null;
  const reported = s.game?.camera as Camera | undefined;
  const canvas = s.canvas;
  const crops = Array.isArray(s.crops) ? s.crops as QaCrop[] : [];
  const published = crops.find((c) => c.name === "flood-bank") ?? null;
  const sample = meta.v2.crops["flood-bank"] ?? null;
  const vp = Array.isArray(s.viewProjection) && s.viewProjection.length === 16 &&
    s.viewProjection.every((v: unknown) => typeof v === "number" && Number.isFinite(v)) ? s.viewProjection as number[] : null;
  const expectedPose = fullTimeOrbitPose(0, true);
  if (s.appCount !== 1 || !Object.values(s.methods).every(Boolean) || !s.ready || !s.settled || s.error)
    problems.push("required live app, hooks, readiness or diagnostics unavailable");
  if (s.state?.frozen !== true || s.state?.phase !== "ended" || s.runtime?.paused !== true)
    problems.push("simulation/full-time engine state is not held");
  if (s.game?.route !== "showcase-aura-fc-3d" || s.game?.venue !== venue || s.game?.mode !== "demo" ||
      s.game?.phase !== "ended" || s.game?.cameraMode !== "celebrate" || s.game?.lookMode !== "hybrid")
    problems.push("game beacon is missing, stale, or not the requested venue/full-time hybrid view");
  if (!s.diagnostics || s.diagnostics.backend !== "webgl2" || !(s.diagnostics.drawCalls > 0) ||
      !Array.isArray(s.diagnostics.errors) || s.diagnostics.errors.length > 0)
    problems.push("WebGL2 renderer/draw-call diagnostics unavailable or erroneous");
  if (s.diagnostics?.texTotal === null || !s.diagnostics?.texTotal || s.diagnostics?.texPending !== 0)
    problems.push("texture diagnostics unavailable, empty, or still pending");
  if (meta.v2.blank || meta.v2.cropErrors?.length) problems.push("blank frame or crop-read errors");
  if (JSON.stringify(heldFields(s)) !== JSON.stringify(heldFields(after))) problems.push("state changed across the screenshot/statistics");
  if (!pose || !camera || !reported || !vector(pose.position) || !vector(pose.target) || !vector(pose.up) ||
      !vector(camera.position) || !vector(camera.target) || !vector(reported.position) || !vector(reported.target) ||
      typeof pose.fov !== "number" || typeof camera.fov !== "number" || typeof reported.fov !== "number" ||
      typeof pose.roll !== "number" || !vp || !s.rig || s.rig === "stub") {
    problems.push("presented, scene, or route camera diagnostics unavailable");
  } else if (!near(pose.position, expectedPose.eye) || !near(pose.target, expectedPose.target) ||
      Math.abs(pose.fov - expectedPose.fov) > 1e-6 || !near(pose.up, [0, 1, 0]) || Math.abs(pose.roll) > 1e-6 ||
      !near(camera.position, pose.position) || !near(camera.target, pose.target) || Math.abs(camera.fov - pose.fov) > 1e-6 ||
      !near(reported.position, pose.position) || !near(reported.target, pose.target) || Math.abs(reported.fov - pose.fov) > 1e-6) {
    problems.push("full-time route, presented, and scene cameras differ");
  }
  if (!canvas || canvas.width <= 0 || canvas.height <= 0 || canvas.clientWidth <= 0 || canvas.clientHeight <= 0 ||
      Math.abs(canvas.width / canvas.height - canvas.clientWidth / canvas.clientHeight) > 0.001)
    problems.push("canvas dimensions/aspect unavailable or inconsistent");
  if (!s.pylon || s.pylon.visible === false || typeof s.pylon.castShadow !== "boolean" || !vector(s.pylon.position) || !vector(s.pylon.rotation) ||
      !String(s.pylon.asset?.url ?? "").endsWith("/fcFloodlightPylonMeshy.636dc3fc.glb") || s.pylon.targetHeight !== 12.5)
    problems.push("the expected visible physical pylon scene node is unavailable");

  const projections = vp ? s.spots.map((spot: { name: string; position: unknown }) => {
    if (!vector(spot.position)) return { name: spot.name, rect: null };
    const [x, y, z] = spot.position;
    return { name: spot.name, rect: matrixBox(vp, [x - 1.2, y - 0.8, z - 1.2], [x + 1.2, y + 0.8, z + 1.2], "flood-bank") };
  }) : [];
  if (projections.length !== 4 || new Set(projections.map((p: { name: string }) => p.name)).size !== 4)
    problems.push("the four actual scene spotlight positions are unavailable");
  const main = projections.find((p: { name: string }) => p.name === `flood-spot-${MAIN_FLOOD_TOWER}` && p.rect);
  const selected = main ?? projections.filter((p: { rect: QaCrop | null }) => p.rect)
    .sort((a: { rect: QaCrop }, b: { rect: QaCrop }) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0] ?? null;
  if (!selected?.rect || selected.name !== "flood-spot-0" || !published ||
      !near(cropValues(selected.rect), cropValues(published), 0.0001))
    problems.push("published crop does not match the presented-matrix selection of the physical far pylon");
  if (!sample || sample.from !== "__AURA_QA__" || !published) {
    problems.push("the published flood crop was not sampled from the screenshot");
  } else {
    const c = meta.v2.canvas;
    const x = c.x + Math.round(published.x * c.w), y = c.y + Math.round(published.y * c.h);
    const x2 = c.x + Math.round((published.x + published.w) * c.w);
    const y2 = c.y + Math.round((published.y + published.h) * c.h);
    if (sample.x !== x || sample.y !== y || sample.w !== x2 - x || sample.h !== y2 - y)
      problems.push("luma sample pixels do not match the published normalized crop");
  }
  return { problems, vp, published, sample, selected, projections };
}

async function waitPresented(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function capture(page: Page, info: TestInfo, venue: string, label: string): Promise<Buffer> {
  const png = await page.screenshot({ type: "png", timeout: 240_000 });
  const b64 = png.toString("base64");
  await info.attach(`${venue}-${label}.png`, { body: png, contentType: "image/png" });
  const count = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < count; i++) log(`GU47_FC_PNG ${venue} ${label} ${i + 1}/${count} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return png;
}

/** Read three lossless screenshots, cropping the same screenshot-pixel rectangle. */
async function pixels(page: Page, images: readonly Buffer[], crop: PixelRect): Promise<number[][]> {
  return page.evaluate(async ({ frames, rect }) => {
    const out: number[][] = [];
    for (const frame of frames) {
      const bytes = Uint8Array.from(atob(frame), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas"); canvas.width = bmp.width; canvas.height = bmp.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || rect.x < 0 || rect.y < 0 || rect.x + rect.w > bmp.width || rect.y + rect.h > bmp.height)
        throw new Error("invalid screenshot crop");
      ctx.drawImage(bmp, 0, 0); bmp.close();
      out.push(Array.from(ctx.getImageData(rect.x, rect.y, rect.w, rect.h).data));
    }
    return out;
  }, { frames: images.map((b) => b.toString("base64")), rect: crop });
}

/** Toggle the actual scene node only after the untouched evidence image has been captured. */
async function setPylon(page: Page, visible: boolean, castShadow: boolean): Promise<void> {
  await page.evaluate(({ on, shadow }) => {
    const apps = (globalThis as G).__AURA3D_LIVE_APPS__?.all?.() ?? [];
    if (apps.length !== 1 || apps[0]?.runtime?.paused !== true) throw new Error("engine is not held");
    const node = apps[0].scene?.nodes?.find((n: any) => n.name === "flood-0" && n.kind === "model");
    if (!node || typeof apps[0].screenshot !== "function") throw new Error("pylon or synchronous render unavailable");
    node.visible = on; node.castShadow = shadow;
    if (node.visible !== on || node.castShadow !== shadow) throw new Error("pylon control was not applied");
    apps[0].screenshot(); // render the paused state, without advancing route or camera
  }, { on: visible, shadow: castShadow });
  await waitPresented(page);
}

let server: ExampleDevServer | undefined;
test.setTimeout(3_000_000);
test.beforeAll(async () => {
  if (process.platform !== "linux" || !process.env.CI || !process.env.AURA3D_RUN_ID)
    throw new Error("Remote ACR only; do not launch a local browser.");
  server = await startExampleDevServer();
});
test.afterAll(async () => { await server?.close(); });

for (const venue of VENUES) {
  test(`FC ${venue}: presented full-time head, crop synchronization and p95`, async ({ page }, info) => {
    const issues: string[] = [];
    const events: string[] = [];
    page.on("pageerror", (e) => events.push(`pageerror ${e.message}`));
    page.on("requestfailed", (r) => events.push(`requestfailed ${r.url()} ${r.failure()?.errorText ?? ""}`));
    page.on("response", (r) => { if (r.status() >= 400) events.push(`http ${r.status()} ${r.url()}`); });
    await page.setViewportSize({ width: 1280, height: 720 });
    let report: Record<string, unknown> = { venue, target: `aura-fc-3d--${venue}`, shot: "separate-full-time-reduced-motion", p95Min: P95_MIN };
    try {
      await page.goto(`${server!.origin}/apps/showcase-aura-fc-3d/index.html?autoplay=1&venue=${venue}&reducedMotion=1`, { waitUntil: "domcontentloaded", timeout: 240_000 });
      await page.waitForFunction(() => (globalThis as G).__AURA_AURA_FC_3D__?.ready?.() === true, undefined, { timeout: 900_000, polling: 1000 });
      await page.evaluate(() => (globalThis as G).__AURA_AURA_FC_3D__!.freeze!(true));
      await page.waitForFunction(() => (globalThis as G).__AURA_FC_SETTLED__ === true, undefined, { timeout: 900_000, polling: 1000 });
      let textureWait = "resolved";
      try {
        await page.waitForFunction(() => {
          const rows = (globalThis as G).__AURA3D_LIVE_APPS__?.all?.()[0]?.diagnostics?.()?.renderer?.runtime?.texturedMaterials;
          return Array.isArray(rows) && rows.length > 0 && rows.every((r: any) => r.status !== "pending");
        }, undefined, { timeout: 180_000, polling: 2000 });
      } catch { textureWait = "timed-out-or-unavailable"; }
      await page.addStyleTag({ content: CANVAS_ONLY });
      const setup = await page.evaluate(() => {
        const g = globalThis as G;
        const apps = g.__AURA3D_LIVE_APPS__?.all?.() ?? [];
        const h = g.__AURA_AURA_FC_3D__;
        if (apps.length !== 1 || !h?.step || !h.state || !h.freeze || !apps[0]?.pause || !apps[0]?.advance)
          throw new Error("required live app or FC QA hooks unavailable");
        const app = apps[0];
        h.freeze(true); app.pause();
        let steps = 0;
        while (h.state().phase !== "ended" && steps < 24_000) { h.step(60); steps += 60; }
        if (h.state().phase !== "ended") throw new Error(`demo did not end after ${steps} steps`);
        // Only hold the demo restart timer; do not alter other game timers.
        const original = window.setTimeout;
        const restartTimers: number[] = [];
        window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
          const id = original.call(window, handler, timeout, ...args);
          if (timeout === 3800 && typeof handler === "function" && String(handler).includes("startDemo")) restartTimers.push(id);
          return id;
        }) as typeof window.setTimeout;
        try { app.advance(0.1); } finally {
          window.setTimeout = original;
          for (const id of restartTimers) window.clearTimeout(id);
        }
        if (restartTimers.length !== 1) throw new Error(`expected one demo restart timer, found ${restartTimers.length}`);
        for (let i = 0; i < 50; i++) app.advance(0.1);
        return { steps, cancelledDemoRestartTimers: restartTimers.length, state: h.state(), runtime: app.runtime };
      });
      // Force a fresh, unthrottled route beacon and render; reduced-motion orbit is stationary.
      await page.waitForTimeout(250);
      await page.evaluate(() => (globalThis as G).__AURA3D_LIVE_APPS__!.all!()[0].step(0));
      await waitPresented(page);
      const before = await page.evaluate(snapshotInPage);
      const on = await capture(page, info, venue, "head-on");
      const meta = await page.evaluate(glMetaInPage, { png: on.toString("base64") });
      const after = await page.evaluate(snapshotInPage);
      const validation = validateFrame(before, after, meta, venue);
      issues.push(...validation.problems);
      const p95 = validation.sample?.p95 ?? null;
      const p95Pass = p95 !== null && p95 >= P95_MIN;
      if (!p95Pass) issues.push(`flood-bank p95 ${String(p95)} is unavailable or below ${P95_MIN}`);
      report = { ...report, setup, textureWait, before, after, projections: validation.projections,
        published: validation.published, sample: validation.sample, frame: { ...meta.v1, ...meta.v2 },
        p95, p95Pass, onSha256: createHash("sha256").update(on).digest("hex") };

      if (!validation.vp || !validation.sample || !before.pylon || typeof before.pylon.castShadow !== "boolean" ||
          validation.selected?.name !== "flood-spot-0")
        throw new Error("cannot run physical head visibility control without synchronized pylon, camera and crop");
      const glb = readGlb(GLB);
      const primitive = glb.json.meshes[0].primitives[0];
      const positionAccessor = glb.json.accessors[primitive.attributes.POSITION];
      const indexAccessor = glb.json.accessors[primitive.indices];
      if (indexAccessor.componentType !== 5123 || indexAccessor.type !== "SCALAR" ||
          glb.json.bufferViews[indexAccessor.bufferView].byteStride !== undefined)
        throw new Error("unsupported pylon index buffer; no visibility claim");
      const offset = (glb.json.bufferViews[indexAccessor.bufferView].byteOffset ?? 0) + (indexAccessor.byteOffset ?? 0);
      const indices = Array.from({ length: indexAccessor.count }, (_, i) => glb.bin.readUInt16LE(offset + 2 * i));
      const positions = accessor(glb, primitive.attributes.POSITION).data;
      const modelMatrix = createModelMatrix(before.pylon as any, { min: positionAccessor.min, max: positionAccessor.max }, true);
      const rect: PixelRect = { x: validation.sample.x, y: validation.sample.y, w: validation.sample.w, h: validation.sample.h };
      const headY = (before.spots.find((s: { name: string }) => s.name === "flood-spot-0")?.position as V3 | undefined)?.[1];
      if (typeof headY !== "number") throw new Error("head height unavailable");
      const mask = headTriangleMask({ positions, indices, modelMatrix, viewProjection: validation.vp,
        minY: headY - 0.8, canvas: meta.v2.canvas, crop: rect });

      let noShadowOn: Buffer | undefined, off: Buffer | undefined, noShadowRestored: Buffer | undefined, restored: Buffer | undefined;
      let noShadowOnState: Snapshot | undefined, offState: Snapshot | undefined, noShadowRestoredState: Snapshot | undefined;
      try {
        await setPylon(page, true, false);
        noShadowOnState = await page.evaluate(snapshotInPage);
        noShadowOn = await capture(page, info, venue, "head-on-no-shadow-control");
        await setPylon(page, false, false);
        offState = await page.evaluate(snapshotInPage);
        off = await capture(page, info, venue, "head-off-no-shadow-control");
        await setPylon(page, true, false);
        noShadowRestoredState = await page.evaluate(snapshotInPage);
        noShadowRestored = await capture(page, info, venue, "head-restored-no-shadow-control");
      } finally {
        await setPylon(page, true, before.pylon.castShadow);
        restored = await capture(page, info, venue, "head-restored-control");
      }
      const restoredState = await page.evaluate(snapshotInPage);
      if (!noShadowOn || !off || !noShadowRestored || !restored || !noShadowOnState || !offState || !noShadowRestoredState ||
          noShadowOnState.pylon?.visible !== true || noShadowOnState.pylon?.castShadow !== false ||
          offState.pylon?.visible !== false || offState.pylon?.castShadow !== false ||
          noShadowRestoredState.pylon?.visible !== true || noShadowRestoredState.pylon?.castShadow !== false ||
          restoredState.pylon?.visible !== true || restoredState.pylon?.castShadow !== before.pylon.castShadow ||
          JSON.stringify(heldFields(before)) !== JSON.stringify(heldFields(noShadowOnState)) ||
          JSON.stringify(heldFields(before)) !== JSON.stringify(heldFields(offState)) ||
          JSON.stringify(heldFields(before)) !== JSON.stringify(heldFields(noShadowRestoredState)) ||
          JSON.stringify(heldFields(before)) !== JSON.stringify(heldFields(restoredState)))
        issues.push("on/off/on control did not hold and restore the same scene, camera and simulation");
      if (noShadowOn && off && noShadowRestored && restored) {
        const [onPixels, noShadowOnPixels, offPixels, noShadowRestoredPixels, restoredPixels] =
          await pixels(page, [on, noShadowOn, off, noShadowRestored, restored], rect);
        const control = compareHeadControl(noShadowOnPixels!, offPixels!, noShadowRestoredPixels!, mask);
        const originalVsNoShadow = compareHeadControl(onPixels!, offPixels!, noShadowOnPixels!, mask);
        const originalRestored = compareHeadControl(onPixels!, offPixels!, restoredPixels!, mask);
        if (!control.supported || !originalVsNoShadow.supported || !originalRestored.supported)
          issues.push("head contribution not established by stable shadow-isolated on/off/on control");
        report = { ...report, control, originalVsNoShadow, originalRestored,
          noShadowOnSha256: createHash("sha256").update(noShadowOn).digest("hex"),
          offSha256: createHash("sha256").update(off).digest("hex"),
          noShadowRestoredSha256: createHash("sha256").update(noShadowRestored).digest("hex"),
          restoredSha256: createHash("sha256").update(restored).digest("hex"),
          noShadowOnState, offState, noShadowRestoredState, restoredState };
      }
    } catch (error) {
      issues.push(`diagnostic unavailable: ${String(error)}`);
    }
    log(`GU47_FC_META ${JSON.stringify({ ...report, status: issues.length ? "not-proven" : "observed", issues, events })}`);
    expect(issues, "separate FC diagnostic; never replaces kickoff warnings").toEqual([]);
  });
}
