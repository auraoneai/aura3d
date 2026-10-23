/**
 * threejs-parity lane L7 - disposal soak (docs/workflows/threejs-parity-gaps.md
 * §5.7, tasks SR-08 / R-09). Remote-only: driven by tests/browser/parity-disposal.spec.ts.
 *
 * 20 load/unload cycles, two shapes:
 *   routeCycles  mount a textured, shadowed scene as an app, read the live
 *                `app.info` gauges at the cycle's peak, dispose the app;
 *   deviceCycles one long-lived WebGL2 renderer; each cycle allocates a
 *                texture, geometry and render target, renders into and
 *                through them, releases all three, and reads the gauges at the
 *                peak and after release.
 * The spec requires every cycle's gauges (approximateGpuMemoryBytes, textures,
 * buffers, renderTargets) to stay within 5% of cycle 1.
 */
import { camera, createAuraApp, lights, material, primitives, scene, texture, type AuraApp } from "@aura3d/engine";
import { createRenderTarget } from "@aura3d/engine/renderer";
import { Geometry, Renderer, Texture, TexturedUnlitMaterial } from "@aura3d/rendering";

interface Gauges {
  readonly approximateGpuMemoryBytes: number;
  readonly textures: number;
  readonly buffers: number;
  readonly renderTargets: number;
}

interface DisposalState {
  status: "boot" | "ready" | "error";
  error?: string;
  cycles: number;
  routeCycles: Gauges[];
  devicePeak: Gauges[];
  deviceAfter: Gauges[];
}

declare global {
  interface Window {
    __AURA3D_PARITY_DISPOSAL__?: DisposalState;
  }
}

const CYCLES = 20;
const state: DisposalState = { status: "boot", cycles: CYCLES, routeCycles: [], devicePeak: [], deviceAfter: [] };
window.__AURA3D_PARITY_DISPOSAL__ = state;
const mountEl = document.querySelector<HTMLElement>("#mount");
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  mountEl?.append(c);
  return c;
}

function gauges(info: {
  readonly approximateGpuMemoryBytes?: number;
  readonly memory: { readonly geometries: number; readonly textures: number; readonly renderTargets?: number };
}): Gauges {
  return {
    approximateGpuMemoryBytes: info.approximateGpuMemoryBytes ?? 0,
    textures: info.memory.textures,
    buffers: info.memory.geometries,
    renderTargets: info.memory.renderTargets ?? 0
  };
}

function checker(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const on = ((x >> 2) + (y >> 2)) % 2 === 0;
      data[i] = on ? 230 : 30;
      data[i + 1] = on ? 140 : 180;
      data[i + 2] = on ? 40 : 230;
      data[i + 3] = 255;
    }
  }
  return data;
}

async function settle(app: AuraApp): Promise<void> {
  await app.ready().catch(() => undefined);
  const start = performance.now();
  while ((app.diagnostics().drawCalls ?? 0) === 0 && performance.now() - start < 45_000) {
    app.step(1 / 60);
    await sleep(60);
  }
  // Post-mount texture upgrade: wait until every authored texture is pixel-backed.
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    const textured = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
    if (textured.length >= 1 && textured.every((m) => m.pixelBacked)) break;
    await sleep(50);
  }
  for (let i = 0; i < 6; i += 1) {
    app.step(1 / 60);
    await sleep(30);
  }
}

async function routeCycles(): Promise<void> {
  const host = canvas(320, 240);
  for (let cycle = 0; cycle < CYCLES; cycle += 1) {
    const albedo = texture.data({ width: 16, height: 16, data: checker(16), colorSpace: "srgb" });
    const app = createAuraApp(host, {
      pixelRatio: 1,
      resize: false,
      scene: scene()
        .background("#0b1020")
        .camera(camera.perspective({ position: [0, 1.6, 4.5], target: [0, 0.4, 0], fov: 42 }))
        .add(lights.ambient({ intensity: 0.5 }))
        .add(lights.directional({ position: [3, 5, 2], intensity: 2.2 }))
        .add(primitives.plane({ name: "ground", size: 6, material: material.pbr({ color: "#ffffff", roughness: 0.9, texture: albedo as never }) }))
        .add(primitives.box({ name: "box", position: [-0.9, 0.5, 0], size: 0.9, material: material.pbr({ color: "#4a8cff", roughness: 0.4 }) }))
        .add(primitives.sphere({ name: "ball", position: [0.9, 0.5, 0], size: 0.9, material: material.pbr({ color: "#ff6a4a", metallic: 0.6, roughness: 0.3 }) }))
    });
    await settle(app);
    const info = app.info;
    if (!info) throw new Error(`cycle ${cycle}: app.info unavailable`);
    state.routeCycles.push(gauges(info));
    app.dispose();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

async function deviceCycles(): Promise<void> {
  const host = canvas(128, 128);
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas: host,
    width: 128,
    height: 128,
    clearColor: [0, 0, 0, 1],
    preserveDrawingBuffer: true
  });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  try {
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      const albedo = new Texture({ width: 64, height: 64, data: checker(64), label: `disposal-albedo-${cycle}` });
      const cube = Geometry.texturedCube(1);
      const target = createRenderTarget(renderer, { width: 64, height: 64, label: `disposal-rt-${cycle}` });
      const draw = (map: Texture, into?: typeof target): void => {
        const items = [{ geometry: cube, material: new TexturedUnlitMaterial({ texture: map }), label: "disposal-cube" }];
        if (into) renderer.render({ source: { renderItems: items, frustumCulling: false, cameraPolicy: "identity" }, target: into });
        else renderer.render({ renderItems: items, frustumCulling: false, cameraPolicy: "require" }, { viewProjectionMatrix: identity });
      };
      draw(albedo, target);
      draw(target.colorTexture);
      draw(albedo);
      state.devicePeak.push(gauges(renderer.info));

      cube.dispose();
      albedo.dispose();
      target.dispose();
      renderer.render({ renderItems: [], frustumCulling: false, cameraPolicy: "require" }, { viewProjectionMatrix: identity });
      state.deviceAfter.push(gauges(renderer.info));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    renderer.dispose();
  }
}

void (async () => {
  try {
    await routeCycles();
    await deviceCycles();
    state.status = "ready";
  } catch (error) {
    state.status = "error";
    state.error = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  }
})();
