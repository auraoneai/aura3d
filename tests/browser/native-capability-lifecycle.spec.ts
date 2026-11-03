import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { checkExpectedBackground, checkExpectedSubject } from "../visual/canvas-pixel-checks";
import { startExampleDevServer } from "./example-dev-server";

/**
 * An independently authored, in-memory glTF triangle. The spec intercepts
 * its same-origin request with these exact GLB bytes; the production typed
 * model path still verifies their SHA-256. No external fixture is downloaded.
 */
function triangleGlb(): Buffer {
  const positions = Buffer.alloc(36);
  [-0.8, -0.8, 0, 0.8, -0.8, 0, 0, 0.8, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0", generator: "Aura3D lifecycle test" },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] }, extensions: { KHR_materials_unlit: {} } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.8, -0.8, 0], max: [0.8, 0.8, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 }],
    buffers: [{ byteLength: positions.length }]
  }));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const result = Buffer.alloc(12 + 8 + jsonLength + 8 + positions.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonLength, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  result.fill(0x20, 20, 20 + jsonLength);
  json.copy(result, 20);
  const binaryHeader = 20 + jsonLength;
  result.writeUInt32LE(positions.length, binaryHeader);
  result.writeUInt32LE(0x004e4942, binaryHeader + 4);
  positions.copy(result, binaryHeader + 8);
  return result;
}

test("typed asset remount, resize, recovery and concurrent-app disposal stay isolated", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const fixture = triangleGlb();
  const fixtureSha256 = createHash("sha256").update(fixture).digest("hex");
  expect({ size: fixture.length, sha256: fixtureSha256 }).toEqual({
    size: 624,
    sha256: "82790c47fc6a0be1965462b2b4ba5f87d8208167722a45dddfabd69d01747f13"
  });
  const fixturePath = "/fixtures/native-capabilities/lifecycle-triangle.glb";
  let fixtureRequests = 0;
  await page.route(`**${fixturePath}`, async (route) => {
    fixtureRequests += 1;
    await route.fulfill({ status: 200, contentType: "model/gltf-binary", body: fixture });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/resource-soak-u1-harness.html?qa=1`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async ({ engineUrl, fixtureUrl, digest }) => {
      const engine = await import(engineUrl);
      const { camera, createAuraApp, defineModelAssets, model, scene } = engine;
      const ref = defineModelAssets({ triangle: { url: fixtureUrl, sha256: digest } }, { license: "MIT" }).refs.triangle;
      const built = () => scene().background("#000000")
        .camera(camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 45 }))
        .add(model(ref, { name: "lifecycle-subject" }));
      type Kind = "buffers" | "textures" | "programs";
      type Snapshot = Record<Kind, number>;
      function canvasWithTracking() {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 96;
        document.body.append(canvas);
        const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
        if (!gl) throw new Error("WebGL2 is unavailable");
        const live: Record<Kind, Set<unknown>> = { buffers: new Set(), textures: new Set(), programs: new Set() };
        const api = gl as unknown as Record<string, unknown>;
        for (const [kind, createName, deleteName] of [
          ["buffers", "createBuffer", "deleteBuffer"], ["textures", "createTexture", "deleteTexture"], ["programs", "createProgram", "deleteProgram"]
        ] as const) {
          const create = api[createName] as (this: WebGL2RenderingContext) => unknown;
          const remove = api[deleteName] as (this: WebGL2RenderingContext, value: unknown) => void;
          api[createName] = function () { const value = create.call(gl); if (value) live[kind].add(value); return value; };
          api[deleteName] = function (value: unknown) { live[kind].delete(value); return remove.call(gl, value); };
        }
        // WebGL invalidates every old native object on a real context loss.
        canvas.addEventListener("webglcontextlost", () => { for (const values of Object.values(live)) values.clear(); });
        return { canvas, gl, snapshot: (): Snapshot => ({ buffers: live.buffers.size, textures: live.textures.size, programs: live.programs.size }) };
      }
      function pixelFrame(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return { width: canvas.width, height: canvas.height, data: Array.from(pixels) };
      }
      async function frame(app: { step(deltaSeconds: number): void }, stage: ReturnType<typeof canvasWithTracking>) {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          app.step(1 / 60);
          const result = pixelFrame(stage.gl, stage.canvas);
          const i = (Math.floor(result.height / 2) * result.width + Math.floor(result.width / 2)) * 4;
          if (result.data[i] > 80 && result.data[i] > 2 * result.data[i + 1]) return result;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        throw new Error("The loaded subject never appeared in the expected region");
      }
      const waitForEvent = (subscribe: (listener: () => void) => () => void): Promise<void> => new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        const timeout = window.setTimeout(() => { unsubscribe(); reject(new Error("Timed out waiting for device event")); }, 15_000);
        unsubscribe = subscribe(() => { clearTimeout(timeout); unsubscribe(); resolve(); });
      });
      const baseline = (window as unknown as { __AURA3D_LIVE_APPS__?: { count(): number } }).__AURA3D_LIVE_APPS__?.count() ?? 0;
      const cycles = [];
      for (let cycle = 0; cycle < 4; cycle += 1) {
        const a = canvasWithTracking();
        const b = canvasWithTracking();
        const appA = createAuraApp(a.canvas, { scene: built(), autoStart: false, resize: false, pixelRatio: 1, quality: "production" });
        const appB = createAuraApp(b.canvas, { scene: built(), autoStart: false, resize: false, pixelRatio: 1, quality: "production" });
        try {
          await Promise.all([appA.ready(), appB.ready()]);
          const before = await frame(appA, a);
          await frame(appB, b);
          a.canvas.width = 128; a.canvas.height = 96;
          const resized = await frame(appA, a);
          appA.setScene(scene().background("#000000"));
          await appA.ready();
          const unloaded = !appA.nodes.has("lifecycle-subject");
          const survivor = await frame(appB, b);
          appA.setScene(built());
          await appA.ready();
          await frame(appA, a);
          let recovered = false;
          if (cycle === 0) {
            const extension = a.gl.getExtension("WEBGL_lose_context");
            if (!extension) throw new Error("WEBGL_lose_context unavailable; recovery is unverified");
            const lost = waitForEvent((listener) => appA.onDeviceLost(listener));
            extension.loseContext();
            await lost;
            if (!appA.deviceLost()) throw new Error("Loss was not reported by the app");
            const restored = waitForEvent((listener) => appA.onDeviceRestored(listener));
            extension.restoreContext();
            await restored;
            appA.setScene(built());
            await appA.ready();
            await frame(appA, a);
            await frame(appB, b);
            recovered = !appA.deviceLost();
          }
          const errors = [...appA.diagnostics().errors, ...appB.diagnostics().errors];
          await appA.disposeAsync();
          const afterFirstDispose = { a: a.snapshot(), b: b.snapshot() };
          const survivorAfterDispose = await frame(appB, b);
          const countAfterFirstDispose = (window as unknown as { __AURA3D_LIVE_APPS__?: { count(): number } }).__AURA3D_LIVE_APPS__?.count() ?? -1;
          await appB.disposeAsync();
          const remaining = { a: a.snapshot(), b: b.snapshot() };
          const appCount = (window as unknown as { __AURA3D_LIVE_APPS__?: { count(): number } }).__AURA3D_LIVE_APPS__?.count() ?? -1;
          cycles.push({ before, resized, survivor, survivorAfterDispose, unloaded, recovered, afterFirstDispose, countAfterFirstDispose, remaining, appCount, errors });
        } finally {
          await Promise.all([appA.disposeAsync(), appB.disposeAsync()]);
          a.canvas.remove(); b.canvas.remove();
        }
      }
      return { baseline, cycles };
    }, { engineUrl: `${server.origin}/packages/engine/src/public/index.ts`, fixtureUrl: fixturePath, digest: fixtureSha256 });

    expect(fixtureRequests).toBeGreaterThan(0);
    expect(result.cycles).toHaveLength(4);
    expect(result.cycles[0].recovered).toBe(true);
    for (const cycle of result.cycles) {
      expect(cycle.unloaded).toBe(true);
      expect(cycle.appCount).toBe(result.baseline);
      expect(cycle.countAfterFirstDispose).toBe(result.baseline + 1);
      expect(cycle.afterFirstDispose.a).toEqual({ buffers: 0, textures: 0, programs: 0 });
      expect(cycle.afterFirstDispose.b.buffers).toBeGreaterThan(0);
      expect(cycle.afterFirstDispose.b.programs).toBeGreaterThan(0);
      expect(cycle.remaining).toEqual({ a: { buffers: 0, textures: 0, programs: 0 }, b: { buffers: 0, textures: 0, programs: 0 } });
      expect(cycle.errors).toEqual([]);
      expect({ width: cycle.resized.width, height: cycle.resized.height }).toEqual({ width: 128, height: 96 });
      for (const frame of [cycle.before, cycle.resized, cycle.survivor, cycle.survivorAfterDispose]) {
        const buffer = { ...frame, data: Uint8Array.from(frame.data) };
        expect(checkExpectedBackground(buffer, { x: 0, y: 0, width: 8, height: 8 }, { r: 0, g: 0, b: 0, a: 255, tolerance: 8 }).passed).toBe(true);
        expect(checkExpectedSubject(buffer, {
          region: { x: Math.floor(frame.width / 4), y: Math.floor(frame.height / 4), width: Math.floor(frame.width / 2), height: Math.floor(frame.height / 2) },
          background: { r: 0, g: 0, b: 0, a: 255, tolerance: 8 },
          subject: { r: 175, g: 0, b: 0, a: 255, tolerance: 80 },
          minSubjectFraction: 0.08,
          minContrast: 60
        }).passed).toBe(true);
      }
    }
    expect(errors).toEqual([]);
    await testInfo.attach("lifecycle-fixture.json", { body: Buffer.from(JSON.stringify({ sha256: fixtureSha256, size: fixture.length, requests: fixtureRequests })), contentType: "application/json" });
  } finally {
    await server.close();
  }
});
