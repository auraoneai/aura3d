import { createHash } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { projectCrop, type QaCrop, type V3 } from "../../../apps/showcase-aura-hoops-3d/src/qaCrops";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { glMetaInPage, type GlMetaResult } from "../game-luma-stats";

/**
 * Remote ACR only; do not run a browser locally. Example (only when a remote run is authorized):
 *
 *   EXTRA_DIRS="apps/showcase-aura-hoops-3d" CONTEXT_PROFILE=full KEEP_IMAGE=0 \
 *     SPECS="tests/browser/gu47/hoops-rucker-crop-sync.spec.ts" tools/remote-acr/run.sh
 *
 * QA_STEP holds the route simulation; app.pause() also holds the engine render clock.
 * Manual advance/step presents two *diagnostic* chase states, not the historical
 * settle-25s/settle-60s captures. The additional zero step lets the camera extension
 * apply the last pose without advancing the route. Verify the published, presented
 * and scene cameras, and the before/after snapshots, rather than assuming they match.
 * Count assignments to the existing QA global: the route catches crop publication
 * errors, so a still-present crop array alone does not prove it is fresh.
 *
 * GU47_HOOPS_META is JSON; GU47_HOOPS_PNG <id> <part>/<total> <base64> is the
 * exact PNG used for its statistics. Concatenate parts in order and base64-decode
 * them to recover the frame from acr-run.log even when artifact egress is disabled.
 * A matching SHA-256 is in the metadata. An absent crop is not proof that a lamp
 * is absent: the four practicals may all project off-screen.
 */
const TARGET = "aura-hoops-3d--rucker";
const CHUNK = 16_000;
const FIXED_DT = 1 / 60;
const CHECKPOINTS = [60, 120] as const;
// evidence/game-upgrades-47/aura-hoops-3d/luma-bands.json, variants.rucker.crops.lamp.p95.
const LAMP_P95_MIN = 245;
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

type CameraPose = { position?: unknown; target?: unknown; fov?: unknown; up?: unknown; roll?: unknown };
type GameCamera = { eye?: unknown; target?: unknown; fov?: unknown };
type SceneNode = { kind?: string; light?: string; name?: string; position?: unknown };
type Diagnostics = {
  drawCalls?: number; backend?: string; errors?: string[]; warnings?: string[];
  renderPath?: { path?: string }; renderer?: { runtime?: { texturedMaterials?: { status?: string }[] } };
};
type LiveApp = {
  runtime?: { paused?: boolean; frame?: number; time?: number };
  scene?: { camera?: CameraPose & { mode?: string }; nodes?: SceneNode[] };
  camera?: { presented?: () => CameraPose; evidence?: () => { rig?: string; viewProjection?: unknown } };
  diagnostics?: () => Diagnostics;
  pause?: () => void;
  advance?: (dt: number) => void;
  step?: (dt: number) => void;
};
type GameEvidence = {
  ready?: boolean; route?: string; venue?: string; phase?: string; mode?: string; framesRendered?: number;
  camera?: GameCamera; ball?: unknown; holder?: unknown; possession?: unknown; frameErrors?: unknown;
};
type Globals = typeof globalThis & {
  __AURA3D_LIVE_APPS__?: { all?: () => LiveApp[] };
  __AURA3D_GAME__?: GameEvidence;
  __AURA_QA__?: { crops?: unknown };
  __qaStep?: (n?: number) => void;
  __GU47_QA_WRITE_COUNT__?: () => number;
};

type StepProof = { beforeFinal: number | null; afterFinal: number | null; afterZero: number | null };

/** This self-contained function is serialized by Playwright and runs in the page. */
function snapshotInPage() {
  const g = globalThis as Globals;
  const apps = g.__AURA3D_LIVE_APPS__?.all?.() ?? [];
  const app = apps.length === 1 ? apps[0] : undefined;
  const game = g.__AURA3D_GAME__;
  const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
  const box = canvas?.getBoundingClientRect();
  let presented: CameraPose | null = null;
  let cameraRig: string | null = null;
  let viewProjection: number[] | null = null;
  let diagnostics: Diagnostics | null = null;
  let diagnosticError: string | null = null;
  try {
    presented = app?.camera?.presented?.() ?? null;
    const evidence = app?.camera?.evidence?.();
    cameraRig = evidence?.rig ?? null;
    viewProjection = Array.isArray(evidence?.viewProjection) ? evidence.viewProjection : null;
    diagnostics = app?.diagnostics?.() ?? null;
  } catch (error) {
    diagnosticError = String(error);
  }
  const rows = diagnostics?.renderer?.runtime?.texturedMaterials;
  const nodes = app?.scene?.nodes;
  const practicals = Array.isArray(nodes)
    ? nodes.filter((n) => n.kind === "light" && n.light === "spot" && n.name?.startsWith("rucker-sodium-"))
      .map((n) => ({ name: n.name, position: n.position }))
    : null;
  return {
    appCount: apps.length,
    qaStepAvailable: typeof g.__qaStep === "function",
    qaPublicationCount: g.__GU47_QA_WRITE_COUNT__?.() ?? null,
    methods: { pause: typeof app?.pause === "function", advance: typeof app?.advance === "function", step: typeof app?.step === "function" },
    runtime: app?.runtime ?? null,
    game: game ? {
      ready: game.ready, route: game.route, venue: game.venue, phase: game.phase, mode: game.mode,
      framesRendered: game.framesRendered, camera: game.camera, ball: game.ball, holder: game.holder,
      possession: game.possession, frameErrors: game.frameErrors
    } : null,
    crops: Array.isArray(g.__AURA_QA__?.crops) ? g.__AURA_QA__.crops : null,
    presented, cameraRig, viewProjection, sceneCamera: app?.scene?.camera ?? null,
    practicals, lampPanelNode: Array.isArray(nodes) ? nodes.some((n) => n.name === "rucker-flood-heads") : null,
    canvas: canvas && box ? {
      clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight,
      width: canvas.width, height: canvas.height,
      x: box.x, y: box.y, rectWidth: box.width, rectHeight: box.height
    } : null,
    diagnostics: diagnostics ? {
      backend: diagnostics.backend ?? null,
      renderPath: diagnostics.renderPath?.path ?? null,
      drawCalls: diagnostics.drawCalls ?? null,
      texTotal: Array.isArray(rows) ? rows.length : null,
      texPending: Array.isArray(rows) ? rows.filter((r) => r?.status === "pending").length : null,
      texStatuses: Array.isArray(rows) ? rows.reduce<Record<string, number>>((counts, r) => {
        const status = r?.status ?? "unknown";
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {}) : null,
      errors: Array.isArray(diagnostics.errors) ? diagnostics.errors.slice(0, 20) : null,
      warnings: Array.isArray(diagnostics.warnings) ? diagnostics.warnings.slice(0, 20) : null
    } : null,
    diagnosticError
  };
}
type Snapshot = ReturnType<typeof snapshotInPage>;

function vector(v: unknown): v is V3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

function cropsOf(value: unknown): QaCrop[] | null {
  if (!Array.isArray(value)) return null;
  const out: QaCrop[] = [];
  for (const raw of value) {
    const c = raw as Partial<QaCrop> | null;
    if (!c || typeof c.name !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(c.name) ||
        ![c.x, c.y, c.w, c.h].every((v) => typeof v === "number" && Number.isFinite(v)) ||
        c.x! < 0 || c.y! < 0 || c.w! <= 0 || c.h! <= 0 || c.x! + c.w! > 1.0001 || c.y! + c.h! > 1.0001 ||
        out.some((p) => p.name === c.name)) return null;
    out.push(c as QaCrop);
  }
  return out;
}

function near(a: readonly number[], b: readonly number[], tolerance: number): boolean {
  return a.length === b.length && a.every((n, i) => Math.abs(n - b[i]!) <= tolerance);
}

function stableFields(s: Snapshot) {
  return {
    runtime: s.runtime, game: s.game, crops: s.crops, presented: s.presented, cameraRig: s.cameraRig,
    qaPublicationCount: s.qaPublicationCount, viewProjection: s.viewProjection, sceneCamera: s.sceneCamera, practicals: s.practicals,
    lampPanelNode: s.lampPanelNode, canvas: s.canvas
  };
}

/** Separate absent/invalid diagnostics from a valid observation of an unpublished crop. */
function classify(before: Snapshot, after: Snapshot, meta: GlMetaResult, expectedFrame: number, proof: StepProof) {
  const problems: string[] = [];
  const game = before.game;
  const pose = before.presented;
  const scene = before.sceneCamera;
  const routeCamera = game?.camera;
  const crops = cropsOf(before.crops);
  const canvas = before.canvas;
  if (before.appCount !== 1 || !before.qaStepAvailable || !before.methods.pause || !before.methods.advance || !before.methods.step) problems.push("live app/QA step/pause/advance/step unavailable");
  if (!game?.ready || game.route !== "showcase-aura-hoops-3d" || game.venue !== "rucker" || game.phase !== "live") problems.push("Rucker live game beacon unavailable");
  if (game?.framesRendered !== expectedFrame) problems.push(`stale or failed route step: expected ${expectedFrame}, got ${game?.framesRendered}`);
  if (proof.beforeFinal === null || proof.afterFinal === null || proof.afterZero === null ||
      proof.afterFinal !== proof.beforeFinal + 1 || proof.afterZero !== proof.afterFinal ||
      before.qaPublicationCount !== proof.afterZero) problems.push("QA crops were not freshly published by the final route step");
  if (before.runtime?.paused !== true || typeof before.runtime.frame !== "number" || typeof before.runtime.time !== "number") problems.push("paused engine runtime unavailable");
  if (!crops) problems.push("QA crops unavailable or malformed");
  if (!canvas || canvas.clientWidth <= 0 || canvas.clientHeight <= 0 || canvas.rectWidth <= 0 || canvas.rectHeight <= 0) problems.push("canvas dimensions unavailable");
  if (!Array.isArray(before.practicals) || before.lampPanelNode === null) problems.push("scene-node diagnostics unavailable");
  if (before.diagnosticError || !before.diagnostics || !before.diagnostics.drawCalls || before.diagnostics.texTotal === null ||
      before.diagnostics.texTotal === 0 || before.diagnostics.texPending !== 0) problems.push("renderer/texture diagnostics unavailable, empty, or pending");
  if (before.diagnostics?.errors?.length) problems.push("renderer reported errors");
  if (meta.v2.blank) problems.push("captured frame is blank");
  if (meta.v2.cropErrors?.length) problems.push(`luma crop errors: ${meta.v2.cropErrors.join("; ")}`);
  if (!pose || !vector(pose.position) || !vector(pose.target) || !vector(pose.up) ||
      typeof pose.fov !== "number" || !Number.isFinite(pose.fov) || pose.fov <= 0 || pose.fov >= 180 ||
      typeof pose.roll !== "number" || before.cameraRig === "stub" || !before.cameraRig ||
      !before.viewProjection || before.viewProjection.length !== 16 ||
      !before.viewProjection.every((n) => typeof n === "number" && Number.isFinite(n))) {
    problems.push("presented camera diagnostics unavailable or stubbed");
  }
  if (!routeCamera || !vector(routeCamera.eye) || !vector(routeCamera.target) || typeof routeCamera.fov !== "number" ||
      !Number.isFinite(routeCamera.fov) || !scene || !vector(scene.position) || !vector(scene.target) ||
      typeof scene.fov !== "number" || scene.mode !== "perspective") problems.push("route/scene camera diagnostics unavailable");
  if (problems.length) return { status: "diagnostics-unavailable", problems, projected: null, selected: null, published: null, p95: null };

  // The route rounds only the beacon FOV to 0.001 degrees; crop projection uses the full pose.
  if (JSON.stringify(stableFields(before)) !== JSON.stringify(stableFields(after))) problems.push("state changed across screenshot/statistics");
  if (!near(routeCamera!.eye as V3, pose!.position as V3, 1e-6) ||
      !near(routeCamera!.target as V3, pose!.target as V3, 1e-6) ||
      Math.abs((routeCamera!.fov as number) - (pose!.fov as number)) > 0.00051 ||
      !near(scene!.position as V3, pose!.position as V3, 1e-6) ||
      !near(scene!.target as V3, pose!.target as V3, 1e-6) ||
      Math.abs((scene!.fov as number) - (pose!.fov as number)) > 1e-6 ||
      !near(pose!.up as V3, [0, 1, 0], 1e-6) || Math.abs(pose!.roll as number) > 1e-6 ||
      canvas!.width <= 0 || canvas!.height <= 0 ||
      Math.abs(canvas!.clientWidth / canvas!.clientHeight - canvas!.width / canvas!.height) > 0.001) problems.push("route, presented and scene cameras/aspects disagree");
  if (problems.length) return { status: "unsynchronized", problems, projected: null, selected: null, published: null, p95: null };

  const eye = pose!.position as V3;
  const target = pose!.target as V3;
  const aspect = canvas!.clientWidth / canvas!.clientHeight;
  const practicals = before.practicals!;
  if (practicals.some((p) => !p.name || !vector(p.position))) {
    return { status: "diagnostics-unavailable", problems: ["practical light positions unavailable"], projected: null, selected: null, published: null, p95: null };
  }
  const projected = practicals.map((p) => {
    const position = p.position as V3;
    // Independent column-major view-projection check, including the same half-extents as the route.
    const m = before.viewProjection!;
    const x = m[0]! * position[0] + m[4]! * position[1] + m[8]! * position[2] + m[12]!;
    const y = m[1]! * position[0] + m[5]! * position[1] + m[9]! * position[2] + m[13]!;
    const w = m[3]! * position[0] + m[7]! * position[1] + m[11]! * position[2] + m[15]!;
    const screen = Math.abs(w) > 1e-9 ? { x: (x / w + 1) / 2, y: (1 - y / w) / 2, depth: w } : null;
    let matrixRect: { x: number; y: number; w: number; h: number } | null = null;
    if (screen && w > 0.1) {
      const t = Math.tan((pose!.fov as number) * Math.PI / 360);
      const halfX = 0.8 / (2 * w * t * aspect), halfY = 0.3 / (2 * w * t);
      const x0 = Math.max(0, screen.x - halfX), x1 = Math.min(1, screen.x + halfX);
      const y0 = Math.max(0, screen.y - halfY), y1 = Math.min(1, screen.y + halfY);
      if (x1 > x0 && y1 > y0) matrixRect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    return {
      name: p.name, position,
      distance: Math.hypot(position[0] - eye[0], position[1] - eye[1], position[2] - eye[2]),
      screen, matrixRect,
      rect: projectCrop(eye, target, pose!.fov as number, aspect, { name: "lamp", at: position, half: [0.8, 0.3] })
    };
  });
  const selected = projected.filter((p) => p.rect).sort((a, b) => a.distance - b.distance)[0] ?? null;
  const published = crops!.find((c) => c.name === "lamp") ?? null;
  const p95 = meta.v2.crops.lamp?.p95 ?? null;
  if (practicals.length === 0 || !before.lampPanelNode) return { status: "lamp-rig-missing", problems: ["scene has no Rucker practicals or emissive head node"], projected, selected, published, p95 };
  if (projected.some((p) => Boolean(p.rect) !== Boolean(p.matrixRect) || (p.rect && p.matrixRect &&
      !near([p.rect.x, p.rect.y, p.rect.w, p.rect.h], [p.matrixRect.x, p.matrixRect.y, p.matrixRect.w, p.matrixRect.h], 0.0002)))) {
    return { status: "projection-mismatch", problems: ["QA projection disagrees with the presented view-projection matrix"], projected, selected, published, p95 };
  }
  if (!selected && !published) return { status: "lamp-crop-unpublished-offscreen", problems, projected, selected, published, p95 };
  if (!selected && published) return { status: "unexpected-lamp-crop", problems: ["no practical projects into the frame"], projected, selected, published, p95 };
  if (selected && !published) return { status: "lamp-crop-missing-visible", problems: ["an on-screen practical has no published crop"], projected, selected, published, p95 };
  const actual = published!;
  const expected = selected!.rect!;
  if (!near([actual.x, actual.y, actual.w, actual.h], [expected.x, expected.y, expected.w, expected.h], 0.0002)) problems.push("published lamp rectangle does not match nearest projected practical");
  if (p95 === null) problems.push("published lamp crop has no pixel statistics");
  else if (p95 < LAMP_P95_MIN) problems.push(`lamp p95 ${p95} is below the unchanged ${LAMP_P95_MIN} band`);
  return { status: problems.length ? "lamp-crop-invalid" : "lamp-crop-published", problems, projected, selected, published, p95 };
}

async function capture(page: Page, testInfo: TestInfo, checkpoint: number, textureWait: string, stepProof: StepProof): Promise<string[]> {
  const id = `frozen-step-${checkpoint}`;
  const before = await page.evaluate(snapshotInPage);
  const png = await page.screenshot({ type: "png", timeout: 240_000 });
  const b64 = png.toString("base64");
  const sha256 = createHash("sha256").update(png).digest("hex");
  await testInfo.attach(`${id}.png`, { body: png, contentType: "image/png" });
  // Emit the original lossless frame first, even if decoding or diagnostics later fail.
  const parts = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < parts; i += 1) log(`GU47_HOOPS_PNG ${id} ${i + 1}/${parts} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  let meta: GlMetaResult;
  try {
    meta = await page.evaluate(glMetaInPage, { png: b64 });
  } catch (error) {
    const report = { target: TARGET, id, status: "diagnostics-unavailable", problems: [`pixel analysis failed: ${String(error)}`], textureWait, sha256, stepProof, before };
    log(`GU47_HOOPS_META ${JSON.stringify(report)}`);
    return [`${id}: ${report.status}: ${report.problems.join("; ")}`];
  }
  const after = await page.evaluate(snapshotInPage);
  const result = classify(before, after, meta, checkpoint, stepProof);
  log(`GU47_HOOPS_META ${JSON.stringify({
    target: TARGET, id, ...result, textureWait, sha256, stepProof, before, after,
    frame: { ...meta.v1, blank: meta.v2.blank, width: meta.v2.w, height: meta.v2.h, canvas: meta.v2.canvas },
    cropStats: meta.v2.crops, cropErrors: meta.v2.cropErrors ?? []
  })}`);
  // This is a diagnostic projection test, not an assertion that a lamp is always in a chase frame.
  return result.status === "lamp-crop-unpublished-offscreen" || result.status === "lamp-crop-published"
    ? [] : [`${id}: ${result.status}: ${result.problems.join("; ")}`];
}

let server: ExampleDevServer | undefined;
test.setTimeout(3_000_000);
test.beforeAll(async () => {
  if (process.platform !== "linux" || !process.env.CI || !process.env.AURA3D_RUN_ID) {
    throw new Error("Remote ACR only: use tools/remote-acr/run.sh; do not launch a local browser.");
  }
  server = await startExampleDevServer();
});
test.afterAll(async () => { await server?.close(); });

test("Rucker lamp crop and frame share a frozen camera/game state", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  page.on("pageerror", (e) => log(`GU47_HOOPS_ERROR ${e.message.slice(0, 500)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) log(`GU47_HOOPS_HTTP ${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => log(`GU47_HOOPS_REQUEST_FAILED ${r.url()} ${r.failure()?.errorText ?? "unknown"}`));
  // Transparent assignment observer: preserve the hook's values/semantics while proving
  // the final fixed step actually replaced the array (publishQaCrops is best-effort).
  await page.addInitScript(() => {
    let value: unknown;
    let writes = 0;
    Object.defineProperty(globalThis, "__AURA_QA__", {
      configurable: true, enumerable: true,
      get: () => value,
      set: (next: unknown) => { value = next; writes += 1; }
    });
    Object.defineProperty(globalThis, "__GU47_QA_WRITE_COUNT__", { value: () => writes });
  });
  await page.goto(`${server!.origin}/apps/showcase-aura-hoops-3d/index.html?court=rucker&look=new&diag=1&qaDt=${FIXED_DT}&qaStep=1`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  try {
    await page.waitForFunction(() => (globalThis as Globals).__AURA3D_GAME__?.ready === true, undefined, { timeout: 900_000, polling: 1000 });
  } catch (error) {
    log(`GU47_HOOPS_META ${JSON.stringify({ target: TARGET, status: "diagnostics-unavailable", problems: [`route did not become ready: ${String(error)}`], state: await page.evaluate(snapshotInPage) })}`);
    throw error;
  }
  // While QA_STEP holds the route, allow textures and the environment to settle as in the luma harness.
  await page.waitForTimeout(25_000);
  let textureWait = "resolved";
  try {
    await page.waitForFunction(() => {
      const rows = (globalThis as Globals).__AURA3D_LIVE_APPS__?.all?.()[0]?.diagnostics?.()?.renderer?.runtime?.texturedMaterials;
      return Array.isArray(rows) && rows.length > 0 && rows.every((r) => r.status !== "pending");
    }, undefined, { timeout: 420_000, polling: 2000 });
  } catch {
    textureWait = "timed-out-or-unavailable";
  }
  await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const initial = await page.evaluate(snapshotInPage);
  if (initial.appCount !== 1 || !initial.qaStepAvailable || !initial.qaPublicationCount || !initial.methods.pause || !initial.methods.advance || !initial.methods.step ||
      initial.game?.framesRendered !== 0) {
    log(`GU47_HOOPS_META ${JSON.stringify({ target: TARGET, status: "diagnostics-unavailable", problems: ["cannot establish a zero-step frozen state"], textureWait, initial })}`);
    throw new Error("Cannot establish frozen QA state; not a missing-lamp finding.");
  }
  await page.evaluate(() => {
    const app = (globalThis as Globals).__AURA3D_LIVE_APPS__!.all!()[0]!;
    app.pause!();
  });
  const failures: string[] = [];
  let previous = 0;
  for (const checkpoint of CHECKPOINTS) {
    try {
      const stepProof = await page.evaluate(({ count, dt }) => {
        const g = globalThis as Globals;
        const app = g.__AURA3D_LIVE_APPS__!.all!()[0]!;
        g.__qaStep!(count);
        for (let i = 0; i < count - 1; i += 1) app.advance!(dt);
        const beforeFinal = g.__GU47_QA_WRITE_COUNT__?.() ?? null;
        app.step!(dt);
        const afterFinal = g.__GU47_QA_WRITE_COUNT__?.() ?? null;
        // Camera's onFrame callback may precede the route's: present the last override without another route step.
        app.step!(0);
        return { beforeFinal, afterFinal, afterZero: g.__GU47_QA_WRITE_COUNT__?.() ?? null };
      }, { count: checkpoint - previous, dt: FIXED_DT });
      // Wait for the compositor to present the explicit render, not for another game frame.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      failures.push(...await capture(page, testInfo, checkpoint, textureWait, stepProof));
    } catch (error) {
      const id = `frozen-step-${checkpoint}`;
      const problems = [`step or frame capture failed: ${String(error)}`];
      const state = await page.evaluate(snapshotInPage).catch(() => null);
      log(`GU47_HOOPS_META ${JSON.stringify({ target: TARGET, id, status: "diagnostics-unavailable", problems, textureWait, state })}`);
      failures.push(`${id}: diagnostics-unavailable: ${problems.join("; ")}`);
      break;
    }
    previous = checkpoint;
  }
  expect(failures, "Rucker synchronized capture diagnostics/projection failures").toEqual([]);
});
