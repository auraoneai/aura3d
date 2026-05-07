import {
  Geometry,
  InstancedUnlitMaterial,
  PBRMaterial,
  Renderer,
  Texture,
  TexturedUnlitMaterial,
  UnlitMaterial,
  type RenderDeviceDiagnostics,
  type RenderItem
} from "@galileo3d/rendering";
import { Scene } from "@galileo3d/scene";

declare global {
  interface Window {
    __GALILEO3D_LARGE_SCENE_TEST__?: LargeSceneHarnessResult;
  }
}

export interface LargeSceneHarnessResult {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly staticMeshes?: number;
  readonly instances?: number;
  readonly instancedBatches?: number;
  readonly textureVariants?: number;
  readonly materialVariants?: number;
  readonly frameMs?: number;
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly centerPixel?: readonly number[];
  readonly textureProbePixel?: readonly number[];
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly error?: string;
}

export interface LargeSceneHarnessOptions {
  readonly canvas?: HTMLCanvasElement;
  readonly statusElement?: HTMLElement;
  readonly width?: number;
  readonly height?: number;
}

const STATIC_MESH_COUNT = 5_000;
const INSTANCE_COUNT = 10_000;
const INSTANCES_PER_BATCH = 64;
const TEXTURE_VARIANT_COUNT = 8;

export async function runLargeSceneHarness(options: LargeSceneHarnessOptions = {}): Promise<LargeSceneHarnessResult> {
  try {
    const canvas = options.canvas ?? ensureCanvas(options.width ?? 256, options.height ?? 256);
    canvas.width = options.width ?? canvas.width;
    canvas.height = options.height ?? canvas.height;

    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvas.width,
      height: canvas.height,
      clearColor: [0.012, 0.015, 0.02, 1],
      antialias: false,
      preserveDrawingBuffer: true
    });

    const scene = new Scene();
    const keyLight = scene.createLight("directional", "large-scene-key");
    keyLight.intensity = 1.4;
    keyLight.color = [1, 0.95, 0.86];
    scene.root.addChild(keyLight);

    const resources = createLargeSceneResources();
    const renderItems = buildLargeSceneRenderItems(resources);
    const start = performance.now();
    const diagnostics = renderer.render({ scene, renderItems });
    const frameMs = performance.now() - start;
    const centerPixel = readPixel(canvas, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
    const textureProbePixel = findPixel(canvas, (r, g, b, a) => a === 255 && r + g + b > 20);

    const result: LargeSceneHarnessResult = {
      status: "ready",
      renderer: "webgl2",
      staticMeshes: STATIC_MESH_COUNT,
      instances: INSTANCE_COUNT,
      instancedBatches: Math.ceil(INSTANCE_COUNT / INSTANCES_PER_BATCH),
      textureVariants: resources.textures.length,
      materialVariants: resources.materials.length,
      frameMs: Number(frameMs.toFixed(2)),
      diagnostics,
      centerPixel,
      textureProbePixel,
      canvasFrame: { width: canvas.width, height: canvas.height }
    };

    renderer.dispose();
    for (const texture of resources.textures) texture.dispose();
    for (const geometry of resources.geometries) geometry.dispose();

    publish(result, options.statusElement);
    return result;
  } catch (error) {
    const result: LargeSceneHarnessResult = {
      status: "error",
      renderer: "webgl2",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    publish(result, options.statusElement);
    return result;
  }
}

interface LargeSceneResources {
  readonly geometries: readonly Geometry[];
  readonly materials: readonly (UnlitMaterial | PBRMaterial | TexturedUnlitMaterial | InstancedUnlitMaterial)[];
  readonly textures: readonly Texture[];
}

function createLargeSceneResources(): LargeSceneResources {
  const textures = Array.from({ length: TEXTURE_VARIANT_COUNT }, (_, index) => createCheckerTexture(index));
  const materials = [
    new UnlitMaterial({ name: "large-scene-red", color: [0.95, 0.16, 0.08, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
    new UnlitMaterial({ name: "large-scene-blue", color: [0.1, 0.48, 0.95, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
    new UnlitMaterial({ name: "large-scene-green", color: [0.1, 0.76, 0.38, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
    new PBRMaterial({ name: "large-scene-pbr-brass", baseColor: [0.88, 0.66, 0.28, 1], metallic: 0.2, roughness: 0.42, emissiveColor: [0.05, 0.035, 0.01], emissiveStrength: 0.8, renderState: { cullMode: "none" } }),
    new PBRMaterial({ name: "large-scene-pbr-cyan", baseColor: [0.16, 0.78, 0.9, 1], metallic: 0.05, roughness: 0.68, emissiveColor: [0.01, 0.06, 0.08], emissiveStrength: 0.8, renderState: { cullMode: "none" } }),
    ...textures.map((texture, index) => new TexturedUnlitMaterial({
      name: `large-scene-checker-${index}`,
      texture,
      color: [1, 1, 1, 1],
      renderState: { depthTest: false, depthWrite: false, cullMode: "none" }
    })),
    new InstancedUnlitMaterial({ name: "large-scene-instanced-warm", color: [1, 0.52, 0.14, 1] }),
    new InstancedUnlitMaterial({ name: "large-scene-instanced-cool", color: [0.18, 0.86, 1, 1] })
  ];
  return {
    geometries: [Geometry.triangle(), Geometry.litTriangle(), Geometry.texturedCube(0.035)],
    materials,
    textures
  };
}

function buildLargeSceneRenderItems(resources: LargeSceneResources): RenderItem[] {
  const [triangle, litTriangle, texturedCube] = resources.geometries;
  if (!triangle || !litTriangle || !texturedCube) {
    throw new Error("Large-scene geometry resources were not created.");
  }

  const items: RenderItem[] = [];

  for (let index = 1; index < STATIC_MESH_COUNT; index += 1) {
    const column = index % 100;
    const row = Math.floor(index / 100);
    const x = -0.98 + column * 0.0198;
    const y = -0.96 + row * 0.0384;
    const size = 0.006 + (index % 5) * 0.0012;
    const textured = index % 11 === 0;
    const pbr = index % 13 === 0;
    const material = textured
      ? resources.materials[5 + (index % TEXTURE_VARIANT_COUNT)]
      : pbr
        ? resources.materials[3 + (index % 2)]
        : resources.materials[index % 3];
    items.push({
      geometry: textured ? texturedCube : pbr ? litTriangle : triangle,
      material,
      modelMatrix: translationScaleMatrix(x, y, 0, size, size, 1),
      label: `large-scene-static-${index}`
    });
  }

  const batches = Math.ceil(INSTANCE_COUNT / INSTANCES_PER_BATCH);
  for (let batch = 0; batch < batches; batch += 1) {
    const count = Math.min(INSTANCES_PER_BATCH, INSTANCE_COUNT - batch * INSTANCES_PER_BATCH);
    items.push({
      geometry: triangle,
      material: resources.materials[13 + (batch % 2)],
      instanceTransforms: buildInstanceTransforms(batch, count),
      modelMatrix: identityMatrix(),
      label: `large-scene-instance-batch-${batch}`
    });
  }

  items.push({
    geometry: triangle,
    material: resources.materials[0],
    modelMatrix: scaleMatrix(0.55, 0.55, 1),
    label: "large-scene-center-probe"
  });

  return items;
}

function buildInstanceTransforms(batch: number, count: number): Float32Array {
  const transforms = new Float32Array(count * 16);
  for (let local = 0; local < count; local += 1) {
    const index = batch * INSTANCES_PER_BATCH + local;
    const column = index % 160;
    const row = Math.floor(index / 160);
    const x = -0.99 + column * 0.01245;
    const y = -0.99 + row * 0.0314;
    transforms.set(translationScaleMatrix(x, y, 0, 0.0038, 0.0038, 1), local * 16);
  }
  return transforms;
}

function createCheckerTexture(index: number): Texture {
  const palette: readonly (readonly [number, number, number])[] = [
    [245, 92, 64],
    [80, 185, 245],
    [115, 220, 132],
    [236, 192, 72],
    [190, 118, 238],
    [74, 224, 205],
    [236, 128, 184],
    [180, 210, 86]
  ];
  const primary = palette[index % palette.length]!;
  const secondary = palette[(index + 3) % palette.length]!;
  const data = new Uint8Array(4 * 4 * 4);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const color = (x + y) % 2 === 0 ? primary : secondary;
      const offset = (y * 4 + x) * 4;
      data.set([color[0], color[1], color[2], 255], offset);
    }
  }
  return new Texture({ width: 4, height: 4, data, colorSpace: "srgb", label: `large-scene-checker-${index}` });
}

function ensureCanvas(width: number, height: number): HTMLCanvasElement {
  let canvas = document.querySelector<HTMLCanvasElement>("#large-scene");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "large-scene";
    document.body.append(canvas);
  }
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function readPixel(canvas: HTMLCanvasElement, x: number, y: number): readonly number[] {
  const context = canvas.getContext("webgl2");
  if (!context) {
    throw new Error("WebGL2 readback context is unavailable.");
  }
  const pixel = new Uint8Array(4);
  context.readPixels(x, y, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
  return Array.from(pixel);
}

function findPixel(
  canvas: HTMLCanvasElement,
  predicate: (r: number, g: number, b: number, a: number) => boolean
): readonly number[] {
  const context = canvas.getContext("webgl2");
  if (!context) {
    throw new Error("WebGL2 readback context is unavailable.");
  }
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  context.readPixels(0, 0, canvas.width, canvas.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const a = pixels[index + 3] ?? 0;
    if (predicate(r, g, b, a)) {
      return [r, g, b, a];
    }
  }
  return [0, 0, 0, 0];
}

function publish(result: LargeSceneHarnessResult, statusElement?: HTMLElement): void {
  window.__GALILEO3D_LARGE_SCENE_TEST__ = result;
  if (statusElement) {
    statusElement.textContent = JSON.stringify(result, null, 2);
  }
}

function identityMatrix(): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

function scaleMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ];
}

function translationScaleMatrix(x: number, y: number, z: number, sx: number, sy: number, sz: number): readonly number[] {
  return [
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    x, y, z, 1
  ];
}
