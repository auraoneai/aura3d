import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { installedAuraPackageAliases, type InstalledPackageAlias } from "./installed-package-resolve";

// Authored in Phase A; execute only after CODE_COMPLETE_GO against the packed
// candidate. The offscreen triangle's original, explicitly authored bounds are
// disjoint from the edited vertices, so stale culling bounds fail visibly.
const moduleName = "virtual:aura3d-native-geometry-query";
const moduleId = `\0${moduleName}`;
const fixture = `
import { batched, camera, createAuraApp, geometry, group, lights, material, raycast, scene } from "@aura3d/engine";

const canvas = document.getElementById("stage");
const view = { position: [0, 0, 4], target: [0, 0, 0], fov: 45, aspect: 1, near: 0.1, far: 30 };
const initialPositions = new Float32Array([3.2, -0.8, 0, 4.8, -0.8, 0, 4, 0.8, 0]);
let app;
let handle;
const pointers = [];
const options = () => ({ handles: [handle], mode: "mesh", layers: 2 });

canvas.addEventListener("pointerdown", (event) => {
  if (!handle) return;
  const rect = canvas.getBoundingClientRect();
  const ndc = [(event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2];
  const input = { camera: view, ndc };
  pointers.push({
    ndc,
    mesh: raycast(input, options()),
    bounds: raycast(input, { handles: [handle], mode: "bounds", layers: 2 }),
    wrongLayer: raycast(input, { ...options(), layers: 1 }),
    beyondFar: raycast(input, { ...options(), far: 3 }),
    beforeNear: raycast(input, { ...options(), near: 5 })
  });
});

async function frame() {
  await app.stepAsync(1 / 60);
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("The installed geometry fixture requires WebGL2");
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error("WebGL pixel readback failed: " + error);
  let redPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    if (r > 40 && r > 2 * g && r > 2 * b) redPixels += 1;
  }
  // readPixels is bottom-up: this sample is at world y about 0.98, above the
  // original tip (0.8), but below the partially edited tip (1.15).
  let upperRed = 0;
  for (let y = 202; y <= 206; y++) for (let x = 126; x <= 130; x++) {
    upperRed += pixels[(y * canvas.width + x) * 4];
  }
  const diagnostics = app.diagnostics();
  return {
    redPixels, upperRed: upperRed / 25, png: canvas.toDataURL("image/png"),
    bounds: handle.bounds(), backend: diagnostics.backend,
    runtime: diagnostics.renderer?.runtime, drawCalls: diagnostics.drawCalls,
    errors: diagnostics.errors
  };
}

function rejection(action) {
  try { action(); return "NO_ERROR"; }
  catch (error) { return error.name + ": " + error.message; }
}

window.geometryQueryProbe = {
  async mount(indexed) {
    const spec = geometry.dynamic({
      positions: initialPositions,
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0.5, 1],
      ...(indexed ? { indices: new Uint16Array([0, 1, 2]) } : {}),
      bounds: { min: [3.2, -0.8, 0], max: [4.8, 0.8, 0] }
    });
    const shader = material.custom({
      glsl: {
        vertex: "void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }",
        fragment: "out vec4 outColor; void main() { outColor = vec4(1.0, 0.03, 0.02, 1.0); }"
      },
      side: "front"
    });
    const stage = scene({ camera: camera.perspective(view), background: "#000000" })
      .add(geometry.custom(spec, { name: "moving-triangle", material: shader, layers: 2, castShadow: false }).runtime({ id: "moving-triangle" }));
    app = createAuraApp(canvas, { scene: stage, strict: true, autoStart: false, resize: false,
      pixelRatio: 1, preserveDrawingBuffer: true, renderer: { mode: "production", qualityProfile: "production" } });
    await app.ready();
    handle = app.nodes.require("moving-triangle");
    if (typeof handle.updateAttribute !== "function") throw new Error("Runtime position updates are unavailable");
    return frame();
  },
  async moveIntoView() {
    const positions = new Float32Array([-0.8, -0.8, 0, 0.8, -0.8, 0, 0, 0.8, 0]);
    handle.updateAttribute("position", { array: positions });
    // Queued updates must own their bytes; this caller mutation must not move
    // the triangle back out of view before the frame consumes them.
    positions.fill(100);
    return frame();
  },
  async extendTip() {
    handle.updateAttribute("position", { array: new Float32Array([0, 1.15, 0]), offset: 2 });
    return frame();
  },
  async setVisible(visible) { handle.visible = visible; return frame(); },
  records() { return pointers; },
  validation() {
    return {
      negativeOffset: rejection(() => handle.updateAttribute("position", { array: [0, 0, 0], offset: -1 })),
      outOfRange: rejection(() => handle.updateAttribute("position", { array: [0, 0, 0], offset: 3 })),
      invalidMode: rejection(() => raycast({ origin: [0, 0, 4], direction: [0, 0, -1] }, { handles: [handle], mode: "invalid" })),
      backFace: raycast({ origin: [0, 0, -4], direction: [0, 0, 1] }, options())
    };
  },
  async dispose() {
    await app.disposeAsync();
    const afterDispose = raycast({ origin: [0, 0, 4], direction: [0, 0, -1] }, options());
    const boundsAfterDispose = raycast({ origin: [0, 0, 4], direction: [0, 0, -1] }, { handles: [handle], mode: "bounds" });
    let stepError = "NO_ERROR";
    try { await app.stepAsync(1 / 60); } catch (error) { stepError = error.name + ": " + error.message; }
    return { afterDispose, boundsAfterDispose, stepError };
  },
  async cleanup() { if (app) await app.disposeAsync(); }
};

let batch;
let batchApp;
let parent;
let geometryId;
let firstSlot;
let secondSlot;
const batchPointers = [];
const matrixAt = (x, z = 0) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1];
canvas.addEventListener("pointerdown", (event) => {
  if (!batch || !parent) return;
  const rect = canvas.getBoundingClientRect();
  const ndc = [(event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2];
  batchPointers.push(raycast({ camera: view, ndc }, { nodes: [parent], mode: "mesh" }));
});

async function batchFrame() {
  await batchApp.stepAsync(1 / 60);
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("The installed batch fixture requires WebGL2");
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error("Batch pixel readback failed: " + error);
  const redAt = (cx) => {
    let sum = 0;
    for (let y = 126; y <= 130; y++) for (let x = cx - 2; x <= cx + 2; x++) sum += pixels[(y * canvas.width + x) * 4];
    return sum / 25;
  };
  const diagnostics = batchApp.diagnostics();
  return { leftRed: redAt(85), rightRed: redAt(201), png: canvas.toDataURL("image/png"),
    backend: diagnostics.backend, runtimeBackend: diagnostics.renderer?.runtime.backend,
    errors: diagnostics.errors, drawCalls: diagnostics.drawCalls };
}

window.batchQueryProbe = {
  async mount() {
    const triangle = geometry.define({ positions: [-0.45, -0.45, 0, 0.45, -0.45, 0, 0, 0.45, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2] });
    batch = batched.mesh({ name: "batched-triangles", maxInstances: 2, multiDraw: "instanced",
      material: material.pbr({ color: "#f23c20", roughness: 1, metallic: 0 }) });
    geometryId = batch.addGeometry(triangle);
    firstSlot = batch.addInstance(geometryId);
    secondSlot = batch.addInstance(geometryId);
    batch.setMatrixAt(firstSlot, matrixAt(-0.75));
    batch.setMatrixAt(secondSlot, matrixAt(0.75));
    // The parent translation is deliberately nonzero for both rendering and queries.
    parent = group("batch-parent", [batch], { position: [0.2, 0, 0] }).toJSON();
    const stage = scene({ camera: camera.perspective(view), background: "#000000" })
      .add(parent).add(lights.ambient({ color: "#ffffff", intensity: 3 }));
    batchApp = createAuraApp(canvas, { scene: stage, strict: true, autoStart: false, resize: false,
      pixelRatio: 1, preserveDrawingBuffer: true, qualityRebuild: { flags: { A3D_PARITY_BATCHING: true, A3D_QR_COMPILER: true }, allowUrlFlags: false },
      renderer: { mode: "production", qualityProfile: "production" } });
    await batchApp.ready();
    return { frame: await batchFrame(), firstSlot, secondSlot };
  },
  async hideFirst() { batch.setVisibleAt(firstSlot, false); return batchFrame(); },
  async reuseAndOverlap() {
    batch.deleteInstance(firstSlot);
    const reused = batch.addInstance(geometryId);
    batch.setMatrixAt(reused, matrixAt(0.75));
    batch.setMatrixAt(secondSlot, matrixAt(0.75, 0.5));
    return { reused, frame: await batchFrame() };
  },
  async disposeBatch() {
    batch.dispose();
    return { frame: await batchFrame(), rejected: rejection(() => batch.setMatrixAt(firstSlot, matrixAt(0))) };
  },
  records() { return batchPointers; },
  async cleanup() { if (batchApp) await batchApp.disposeAsync(); if (batch) batch.dispose(); }
};
`;

type Hit = {
  nodeName?: string; nodeId?: string; distance: number; point: number[]; normal: number[];
  faceIndex?: number; uv?: number[]; barycentric?: number[]; batchMemberId?: number;
};
type PointerRecord = { ndc: number[]; mesh: Hit[]; bounds: Hit[]; wrongLayer: Hit[]; beyondFar: Hit[]; beforeNear: Hit[] };
type Frame = {
  redPixels: number; upperRed: number; png: string; bounds: { min: number[]; max: number[] };
  backend: string; runtime: { backend: string; culledObjects: number; frustumTestedObjects: number; visibleObjects: number };
  drawCalls: number; errors: string[];
};
interface GeometryProbe {
  mount(indexed: boolean): Promise<Frame>;
  moveIntoView(): Promise<Frame>;
  extendTip(): Promise<Frame>;
  setVisible(visible: boolean): Promise<Frame>;
  records(): PointerRecord[];
  validation(): { negativeOffset: string; outOfRange: string; invalidMode: string; backFace: Hit[] };
  dispose(): Promise<{ afterDispose: Hit[]; boundsAfterDispose: Hit[]; stepError: string }>;
  cleanup(): Promise<void>;
}
type BatchFrame = { leftRed: number; rightRed: number; png: string; backend: string; runtimeBackend: string; errors: string[]; drawCalls: number };
interface BatchProbe {
  mount(): Promise<{ frame: BatchFrame; firstSlot: number; secondSlot: number }>;
  hideFirst(): Promise<BatchFrame>;
  reuseAndOverlap(): Promise<{ reused: number; frame: BatchFrame }>;
  disposeBatch(): Promise<{ frame: BatchFrame; rejected: string }>;
  records(): Hit[][];
  cleanup(): Promise<void>;
}

function fixturePlugin(aliases: readonly InstalledPackageAlias[]): Plugin {
  const exports = new Map(aliases.map((entry) => [entry.find, entry.replacement]));
  return {
    name: "aura3d-native-geometry-query-fixture",
    enforce: "pre",
    resolveId(id) {
      if (id === moduleName) return moduleId;
      if (!id.startsWith("@aura3d/")) return undefined;
      const target = exports.get(id);
      if (!target) throw new Error(`Packed candidate lacks the requested export: ${id}`);
      return target;
    },
    load(id) { return id === moduleId ? fixture : undefined; },
    configureServer(server) {
      server.middlewares.use("/wp01-geometry-query.html", (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end('<!doctype html><style>html,body{margin:0}canvas{display:block;width:256px;height:256px;touch-action:none}</style><canvas id="stage" width="256" height="256"></canvas><script type="module" src="/@id/__x00__virtual:aura3d-native-geometry-query"></script>');
      });
    }
  };
}

let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the validated packed candidate consumer");
  const candidateRoot = realpathSync(resolve(root));
  const aliases = installedAuraPackageAliases();
  for (const alias of aliases) {
    if (!realpathSync(alias.replacement).startsWith(`${candidateRoot}${sep}`)) {
      throw new Error(`Candidate export resolves outside its installed consumer: ${alias.find}`);
    }
  }
  const engine = aliases.find((entry) => entry.find === "@aura3d/engine");
  if (!engine || realpathSync(engine.replacement).includes("/packages/engine/src/")) {
    throw new Error("Expected the installed packed root engine entrypoint");
  }
  server = await createServer({ configFile: false, root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] },
    server: { fs: { allow: [process.cwd(), candidateRoot] } }, plugins: [fixturePlugin(aliases)] });
  await server.listen(0);
  origin = server.resolvedUrls?.local[0] ?? "";
  if (!origin) throw new Error("The candidate geometry test server has no local origin");
});
test.afterAll(async () => { await server?.close(); });
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(async () => {
    const fixture = window as unknown as { geometryQueryProbe?: GeometryProbe; batchQueryProbe?: BatchProbe };
    await fixture.geometryQueryProbe?.cleanup();
    await fixture.batchQueryProbe?.cleanup();
  });
});

for (const indexed of [true, false]) {
  test(`packed ${indexed ? "indexed" : "generated-index"} geometry updates culling and pointer hits`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    await page.goto(`${origin}wp01-geometry-query.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { geometryQueryProbe?: GeometryProbe }).geometryQueryProbe));
    const initial = await page.evaluate((value) => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.mount(value), indexed);
    const canvas = page.locator("#stage");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("The geometry fixture canvas has no pointer target");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const moved = await page.evaluate(() => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.moveIntoView());
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // Inside the AABB's upper-right corner, but outside the triangle itself.
    await page.mouse.click(box.x + box.width * 0.665, box.y + box.height * 0.335);
    const records = await page.evaluate(() => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.records());
    const validation = await page.evaluate(() => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.validation());
    const extended = await page.evaluate(() => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.extendTip());
    const hidden = await page.evaluate(() => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.setVisible(false));
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const hiddenRecord = (await page.evaluate(() => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.records())).at(-1)!;
    const restored = await page.evaluate(() => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.setVisible(true));
    const disposed = await page.evaluate(() => (window as unknown as { geometryQueryProbe: GeometryProbe }).geometryQueryProbe.dispose());

    for (const frame of [initial, moved, extended, hidden, restored]) {
      expect(frame.backend).toBe("webgl2");
      expect(frame.runtime.backend).toBe("production-runtime");
      expect(frame.errors).toEqual([]);
    }
    expect(initial.bounds.min[0]).toBeGreaterThan(3);
    expect(initial.redPixels).toBe(0);
    expect(initial.runtime.frustumTestedObjects).toBeGreaterThan(0);
    expect(initial.runtime.culledObjects).toBeGreaterThan(0);
    expect(moved.bounds.min[0]).toBeCloseTo(-0.8);
    expect(moved.bounds.max[0]).toBeCloseTo(0.8);
    expect(moved.runtime.frustumTestedObjects).toBeGreaterThan(0);
    expect(moved.runtime.visibleObjects).toBeGreaterThan(0);
    expect(moved.drawCalls).toBeGreaterThan(0);
    expect(moved.redPixels).toBeGreaterThan(2_000);
    expect(extended.bounds.max[1]).toBeCloseTo(1.15);
    expect(moved.upperRed).toBeLessThan(20);
    expect(extended.upperRed).toBeGreaterThan(80);
    expect(hidden.redPixels).toBe(0);
    expect(restored.redPixels).toBeGreaterThan(2_000);

    expect(records).toHaveLength(3);
    expect(records[0]!.mesh).toEqual([]);
    const center = records[1]!;
    expect(center.mesh).toHaveLength(1);
    expect(center.bounds).toHaveLength(1);
    expect(center.mesh[0]).toMatchObject({ nodeName: "moving-triangle", nodeId: "moving-triangle", faceIndex: 0 });
    expect(center.mesh[0]!.distance).toBeCloseTo(4, 3);
    expect(center.mesh[0]!.point[0]).toBeCloseTo(0, 3);
    expect(center.mesh[0]!.point[1]).toBeCloseTo(0, 3);
    expect(center.mesh[0]!.uv?.[0]).toBeCloseTo(0.5, 3);
    expect(center.mesh[0]!.uv?.[1]).toBeCloseTo(0.5, 3);
    expect(center.mesh[0]!.barycentric).toBeDefined();
    expect(center.mesh[0]!.barycentric!.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
    expect(center.mesh[0]!.normal[2]).toBeCloseTo(1, 5);
    expect(center.wrongLayer).toEqual([]);
    expect(center.beyondFar).toEqual([]);
    expect(center.beforeNear).toEqual([]);
    expect(records[2]!.mesh).toEqual([]);
    expect(records[2]!.bounds).toHaveLength(1);
    expect(hiddenRecord.mesh).toEqual([]);
    expect(hiddenRecord.bounds).toEqual([]);
    expect(validation.negativeOffset).toMatch(/RangeError.*offset/i);
    expect(validation.outOfRange).toMatch(/RangeError.*range/i);
    expect(validation.invalidMode).toMatch(/RangeError.*mode/i);
    expect(validation.backFace).toEqual([]);
    expect(disposed.afterDispose).toEqual([]);
    expect(disposed.boundsAfterDispose).toEqual([]);
    expect(disposed.stepError).toMatch(/disposed/i);
    expect(errors).toEqual([]);

    for (const [name, value] of Object.entries({ initial: initial.png, moved: moved.png, extended: extended.png, hidden: hidden.png })) {
      expect(value).toMatch(/^data:image\/png;base64,/);
      await testInfo.attach(`${indexed ? "indexed" : "generated-index"}-${name}.png`, { body: Buffer.from(value.split(",")[1]!, "base64"), contentType: "image/png" });
    }
  });
}

test("packed batches preserve member hits and rendered visibility through slot reuse and disposal", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.goto(`${origin}wp01-geometry-query.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { batchQueryProbe?: BatchProbe }).batchQueryProbe));
  const initial = await page.evaluate(() => (window as unknown as { batchQueryProbe: BatchProbe }).batchQueryProbe.mount());
  const box = await page.locator("#stage").boundingBox();
  if (!box) throw new Error("The batch fixture canvas has no pointer target");
  // At z=0 the parent adds 0.2 to instance-local positions -0.75 and +0.75.
  const clickWorldX = async (x: number) => page.mouse.click(box.x + box.width * (0.5 + x / (8 * Math.tan(Math.PI / 8))), box.y + box.height / 2);
  await clickWorldX(-0.55);
  await clickWorldX(0.95);
  const hidden = await page.evaluate(() => (window as unknown as { batchQueryProbe: BatchProbe }).batchQueryProbe.hideFirst());
  await clickWorldX(-0.55);
  await clickWorldX(0.95);
  const overlapped = await page.evaluate(() => (window as unknown as { batchQueryProbe: BatchProbe }).batchQueryProbe.reuseAndOverlap());
  await clickWorldX(-0.55);
  await clickWorldX(0.95);
  const disposed = await page.evaluate(() => (window as unknown as { batchQueryProbe: BatchProbe }).batchQueryProbe.disposeBatch());
  await clickWorldX(0.95);
  const records = await page.evaluate(() => (window as unknown as { batchQueryProbe: BatchProbe }).batchQueryProbe.records());

  for (const frame of [initial.frame, hidden, overlapped.frame, disposed.frame]) {
    expect(frame.backend).toBe("webgl2");
    expect(frame.runtimeBackend).toBe("production-runtime");
    expect(frame.errors).toEqual([]);
  }
  expect(initial.firstSlot).not.toBe(initial.secondSlot);
  expect(initial.frame.drawCalls).toBeGreaterThan(0);
  expect(initial.frame.leftRed).toBeGreaterThan(30);
  expect(initial.frame.rightRed).toBeGreaterThan(30);
  expect(hidden.leftRed).toBeLessThan(15);
  expect(hidden.rightRed).toBeGreaterThan(30);
  expect(overlapped.reused).toBe(initial.firstSlot);
  expect(overlapped.frame.leftRed).toBeLessThan(15);
  expect(overlapped.frame.rightRed).toBeGreaterThan(30);
  expect(disposed.frame.leftRed).toBeLessThan(15);
  expect(disposed.frame.rightRed).toBeLessThan(15);
  expect(disposed.rejected).toMatch(/disposed/i);

  expect(records).toHaveLength(7);
  expect(records[0]!.map((hit) => hit.batchMemberId)).toEqual([initial.firstSlot]);
  expect(records[1]!.map((hit) => hit.batchMemberId)).toEqual([initial.secondSlot]);
  expect(records[2]).toEqual([]);
  expect(records[3]!.map((hit) => hit.batchMemberId)).toEqual([initial.secondSlot]);
  expect(records[4]).toEqual([]);
  expect(records[5]!.map((hit) => hit.batchMemberId)).toEqual([initial.secondSlot, initial.firstSlot]);
  expect(records[5]![0]!.distance).toBeLessThan(records[5]![1]!.distance);
  expect(records[6]).toEqual([]);
  expect(errors).toEqual([]);

  for (const [name, frame] of Object.entries({ initial: initial.frame, hidden, overlapped: overlapped.frame, disposed: disposed.frame })) {
    expect(frame.png).toMatch(/^data:image\/png;base64,/);
    await testInfo.attach(`batch-${name}.png`, { body: Buffer.from(frame.png.split(",")[1]!, "base64"), contentType: "image/png" });
  }
});
