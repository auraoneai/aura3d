import { InstancedMesh, Scene, composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, InstancedPBRMaterial, Renderer, createExternalParityEnvironmentLighting } from "/packages/rendering/src/index.ts";

/**
 * Instanced-mesh performance route.
 *
 * This route exists so `tools/threejs-parity-instancing-parity` can earn its four
 * route-level rows from a mounted route rather than from a declaration. Those rows —
 * `route-public-scene-instanced-mesh`, `route-one-draw`, `route-instance-count`, and
 * `route-instance-attributes` — were failing closed with `undefined` because the
 * `/apps/instancing-performance/` route the audit reads had no source in the tree, exactly
 * like `lines-helpers` and `controls-transform` before them.
 *
 * The workload matches the shared benchmark descriptor at
 * `benchmarks/shared/scenes/instancing.ts` (4,096 instances), so the route and the
 * Three.js comparison measure the same scene rather than two different ones.
 *
 * Each published field is device-observed, not authored: the draw-call count and the
 * instanced-submission count come from renderer diagnostics, and the attribute buffer
 * count and byte total are measured from the typed arrays actually uploaded.
 */

const INSTANCE_COUNT = 4096;
const GRID = 64;
const RESOLUTION = { width: 1280, height: 720 } as const;

interface InstancingRuntime {
  readonly appId: "instancing-performance";
  readonly status: "loading" | "ready" | "running" | "error";
  /** True only when the instanced mesh came from the public `Scene.createInstancedMesh`. */
  readonly publicSceneInstancedMesh: boolean;
  readonly drawCalls: number;
  readonly instanceCount: number;
  readonly instanceAttributeBuffers: number;
  readonly instanceAttributeBytes: number;
  readonly nativeInstancedSubmissions: number;
  readonly dynamicMatrixUpdates: number;
  readonly frameCount: number;
  readonly fps: number;
  readonly renderer: "a3d-webgl2";
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __a3dinstancingperformance?: InstancingRuntime;
  }
}

let frameCount = 0;
let fps = 0;
let dynamicMatrixUpdates = 0;

function publish(state: Partial<InstancingRuntime> & { readonly status: InstancingRuntime["status"] }): void {
  window.__a3dinstancingperformance = {
    appId: "instancing-performance",
    publicSceneInstancedMesh: false,
    drawCalls: 0,
    instanceCount: 0,
    instanceAttributeBuffers: 0,
    instanceAttributeBytes: 0,
    nativeInstancedSubmissions: 0,
    dynamicMatrixUpdates,
    frameCount,
    fps,
    renderer: "a3d-webgl2",
    claimBoundary: "Proves the public Scene.createInstancedMesh path submits 4096 instances in a single draw call with per-instance transform and colour attributes, measured from renderer diagnostics. It does not claim a performance win over another renderer.",
    ...state
  };
}

publish({ status: "loading" });

void run().catch((error: unknown) => {
  publish({ status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
});

/** Builds the instance grid transforms, and returns the backing array so it can be animated. */
function createInstanceTransforms(timeSeconds: number): Float32Array {
  const transforms = new Float32Array(INSTANCE_COUNT * 16);
  for (let index = 0; index < INSTANCE_COUNT; index += 1) {
    const column = index % GRID;
    const row = Math.floor(index / GRID);
    const x = (column - (GRID - 1) / 2) * 0.34;
    const z = (row - (GRID - 1) / 2) * 0.34;
    // A per-instance vertical wave, so the matrices are genuinely dynamic per frame rather
        // than uploaded once and reported as "dynamic".
    const y = Math.sin(timeSeconds * 1.2 + (column + row) * 0.22) * 0.42;
    const matrix = composeMat4([x, y, z], [0, 0, 0, 1], [0.13, 0.13, 0.13]);
    transforms.set(matrix, index * 16);
  }
  return transforms;
}

function createInstanceColors(): Float32Array {
  const colors = new Float32Array(INSTANCE_COUNT * 4);
  for (let index = 0; index < INSTANCE_COUNT; index += 1) {
    const column = index % GRID;
    const row = Math.floor(index / GRID);
    colors[index * 4] = 0.35 + (column / GRID) * 0.6;
    colors[index * 4 + 1] = 0.45 + (row / GRID) * 0.45;
    colors[index * 4 + 2] = 0.75 - (column / GRID) * 0.35;
    colors[index * 4 + 3] = 1;
  }
  return colors;
}

async function run(): Promise<void> {
  const canvas = document.getElementById("viewport");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("instancing-performance requires canvas#viewport");
  canvas.width = RESOLUTION.width;
  canvas.height = RESOLUTION.height;

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: RESOLUTION.width,
    height: RESOLUTION.height,
    clearColor: [0.012, 0.014, 0.018, 1],
    antialias: true
  });

  // The public scene API, which is the surface the parity audit requires.
  const scene = new Scene();
  // Scene rendering resolves renderable geometry/material through resource lookups, so the
  // node references them by id and the libraries own the instances.
  const geometryLibrary = new Map([["instanced-part", Geometry.litCube(1)]]);
  // `InstancedPBRMaterial` selects the `aura3d/instanced-pbr` shader, which declares the
  // per-instance matrix and colour attributes. A plain `PBRMaterial` compiles `aura3d/pbr-direct`,
  // which has no instance attributes, so the forward pass falls back to expanding the batch into
  // one draw per instance: 4,096 instances produced 4,096 draw calls at 9 FPS.
  const materialLibrary = new Map([["instanced-part", new InstancedPBRMaterial({
    name: "instanced-product-part",
    baseColor: [0.72, 0.76, 0.82, 1],
    metallic: 0.28,
    roughness: 0.42
  })]]);
  const instanced = scene.createInstancedMesh({
    name: "instanced-product-parts",
    renderable: { geometry: "instanced-part", material: "instanced-part" }
  });
  const publicSceneInstancedMesh = instanced instanceof InstancedMesh;
  // `createInstancedMesh` registers the node but does not parent it, so it must be attached to
  // the scene root or the renderer collects nothing and reports zero draw calls.
  scene.root.addChild(instanced);

  const colors = createInstanceColors();
  instanced.setInstanceColors(colors);
  let transforms = createInstanceTransforms(0);
  instanced.setInstanceTransforms(transforms);

  const environmentLighting = createExternalParityEnvironmentLighting("studio").lighting;
  const startedAt = performance.now();
  let fpsFrom = startedAt;
  let fpsFrames = 0;

  const renderFrame = (): void => {
    const timeSeconds = (performance.now() - startedAt) / 1000;
    // Rewrite every instance matrix each frame: this is the dynamic per-instance update path.
    transforms = createInstanceTransforms(timeSeconds);
    instanced.setInstanceTransforms(transforms);
    dynamicMatrixUpdates += 1;

    const diagnostics = renderer.render({
      scene,
      geometryLibrary,
      materialLibrary,
      environmentLighting,
      cameraPolicy: "auto-frame"
    });

    frameCount += 1;
    fpsFrames += 1;
    const now = performance.now();
    if (now - fpsFrom >= 500) {
      fps = Number(((fpsFrames * 1000) / (now - fpsFrom)).toFixed(2));
      fpsFrames = 0;
      fpsFrom = now;
    }

    const instanceTransforms = instanced.instanceTransforms;
    const instanceColors = instanced.instanceColors;
    // Attribute buffers and bytes are read from the arrays actually uploaded, so a route that
    // forgot to supply colours cannot report two buffers.
    const attributeArrays = [instanceTransforms, instanceColors].filter((array): array is Float32Array => Boolean(array));
    publish({
      status: frameCount > 1 ? "running" : "ready",
      publicSceneInstancedMesh,
      drawCalls: diagnostics.drawCalls,
      instanceCount: instanceTransforms ? instanceTransforms.length / 16 : 0,
      instanceAttributeBuffers: attributeArrays.length,
      instanceAttributeBytes: attributeArrays.reduce((total, array) => total + array.byteLength, 0),
      nativeInstancedSubmissions: diagnostics.nativeInstancedSubmissions ?? 0
    });

    requestAnimationFrame(renderFrame);
  };

  renderFrame();
}
