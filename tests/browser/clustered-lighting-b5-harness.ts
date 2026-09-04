import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  createClusteredForwardLighting,
  createLightingRig,
  type CollectedLight,
  type LightingRigPreset,
  type RenderItem
} from "@aura3d/rendering";
import { PerspectiveCamera, PointLight, Scene } from "@aura3d/scene";

type B5RigPreset = "cinematic-night" | "arena-showdown" | "product-hero";

const RIG_PRESETS: readonly B5RigPreset[] = ["cinematic-night", "arena-showdown", "product-hero"];

interface RootPixelMetrics {
  readonly width: number;
  readonly height: number;
  readonly nonBlackPixels: number;
  readonly colorBuckets: number;
  readonly meanLuma: number;
  readonly hash: string;
}

interface RootVariantCapture {
  readonly id: string;
  readonly backend: string;
  readonly drawCalls: number;
  readonly renderSize: readonly number[];
  readonly pixels: RootPixelMetrics;
}

interface RootVariantComparison {
  readonly variantA: string;
  readonly variantB: string;
  readonly pixelDelta: number;
  readonly changedPixelFraction: number;
}

interface ClusterFallbackEvidence {
  readonly requestedLights: number;
  readonly indexedLights: number;
  readonly droppedLights: number;
  readonly overBudgetClusters: number;
  readonly peakRequested: number;
  readonly fallbackPolicy: string;
  readonly requestedPerCluster: readonly number[];
  readonly indexedPerCluster: readonly number[];
  readonly warnings: readonly string[];
  readonly keptLightNames: readonly string[];
  readonly keptMaxDistance: number;
}

interface RigMountEvidence {
  readonly preset: LightingRigPreset;
  readonly lightCount: number;
  readonly kinds: readonly string[];
  readonly rectAreaCount: number;
  readonly spotCount: number;
  readonly shadowCastingCount: number;
  readonly softboxCount: number;
  readonly mountedRootBuilders: readonly string[];
}

interface RectPrimitiveEvidence {
  readonly status: "ready" | "error";
  readonly drawCalls?: Record<string, number>;
  readonly offToOnChangedPixels?: number;
  readonly offToOnPixelDelta?: number;
  readonly narrowToWideChangedPixels?: number;
  readonly narrowToWidePixelDelta?: number;
  readonly hashes?: Record<string, string>;
  readonly claimBoundary?: string;
  readonly error?: string;
}

interface ClusterB5Runner {
  readonly presets: readonly B5RigPreset[];
  clusterFallback(): ClusterFallbackEvidence;
  rigMountInfo(preset: B5RigPreset): RigMountEvidence;
  renderRootVariant(id: string): Promise<RootVariantCapture>;
  compareRootVariants(variantA: string, variantB: string): RootVariantComparison;
  rectPrimitiveProof(): Promise<RectPrimitiveEvidence>;
}

declare global {
  interface Window {
    __AURA3D_CLUSTER_B5_RUNNER__?: ClusterB5Runner;
    __AURA3D_CLUSTER_B5_ERROR__?: string;
  }
}

const rootCaptures = new Map<string, { capture: RootVariantCapture; pixels: Uint8Array }>();

void run().catch((error: unknown) => {
  window.__AURA3D_CLUSTER_B5_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const params = new URL(window.location.href).searchParams;
  const initial = params.get("initial") ?? "city64";
  const app = createAuraApp(requiredElement("b5-stage"), {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: sceneForVariant(initial)
  });
  let currentVariantId = initial;
  await waitForAppDraw(app);

  window.__AURA3D_CLUSTER_B5_RUNNER__ = {
    presets: RIG_PRESETS,
    clusterFallback: () => runClusterFallback(),
    rigMountInfo: (preset) => rigMountEvidence(preset),
    renderRootVariant: async (id: string): Promise<RootVariantCapture> => {
      if (currentVariantId !== id) {
        // drawCalls/renderSize stay true across a scene swap, so a plain
        // ready-wait can capture the outgoing scene. Sample the outgoing
        // frame and poll until the incoming scene replaces it.
        const outgoing = sampleCanvasHash(app);
        app.setScene(sceneForVariant(id));
        currentVariantId = id;
        await waitForAppDraw(app);
        await waitForSceneSwap(app, outgoing);
      } else {
        await waitForAppDraw(app);
      }
      const capture = readRootCapture(app, id);
      rootCaptures.set(id, capture);
      return capture.capture;
    },
    compareRootVariants: (variantA: string, variantB: string): RootVariantComparison =>
      compareRootCaptures(variantA, variantB),
    rectPrimitiveProof: async (): Promise<RectPrimitiveEvidence> => renderRectPrimitiveProof()
  };
}

// ---------------------------------------------------------------------------
// Part 1: clustered over-budget fallback (package-level, deterministic).
// ---------------------------------------------------------------------------

function runClusterFallback(): ClusterFallbackEvidence {
  // 70 point emitters along +x, farthest-first input order, one 64x64 cluster.
  const total = 70;
  const lights70: CollectedLight[] = Array.from({ length: total }, (_, order) => {
    const distance = total - 1 - order;
    const source = new PointLight(`b5-browser-point-${distance}`);
    source.intensity = 1;
    return {
      kind: "point",
      color: [1, 1, 1],
      intensity: 1,
      position: [distance, 0, 0],
      direction: [0, -1, 0],
      range: 1000,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source
    };
  });
  const warnings: string[] = [];
  const clustered = createClusteredForwardLighting(lights70, 64, 64, undefined, {
    observerPosition: [0, 0, 0],
    onWarning: (message) => warnings.push(message)
  });
  const indices = clustered.lightIndices.texture?.textureLevels[0]?.data as Float32Array;
  const kept = Array.from({ length: 64 }, (_, slot) => {
    const lightIndex = indices[slot * 4] ?? -1;
    return lights70[lightIndex]!;
  });
  const evidence: ClusterFallbackEvidence = {
    requestedLights: clustered.diagnostics.requestedLightCount,
    indexedLights: clustered.diagnostics.indexedLightCount,
    droppedLights: clustered.diagnostics.droppedLightCount,
    overBudgetClusters: clustered.diagnostics.overBudgetClusterCount,
    peakRequested: clustered.diagnostics.maxRequestedLightsInCluster,
    fallbackPolicy: clustered.diagnostics.fallbackPolicy,
    requestedPerCluster: [...clustered.diagnostics.requestedPerCluster],
    indexedPerCluster: [...clustered.diagnostics.indexedPerCluster],
    warnings: [...clustered.diagnostics.warnings, ...warnings.slice(1)],
    keptLightNames: kept.map((light) => light.source.name),
    keptMaxDistance: Math.max(...kept.map((light) => light.position[0]))
  };
  clustered.dispose();
  return evidence;
}

// ---------------------------------------------------------------------------
// Part 2: rig presets mounted from root with one call each.
// ---------------------------------------------------------------------------

function rigMountEvidence(preset: B5RigPreset): RigMountEvidence {
  const rig = createLightingRig({ preset });
  return {
    preset: rig.preset,
    lightCount: rig.lights.length,
    kinds: rig.lights.map((light) => light.kind),
    rectAreaCount: rig.lights.filter((light) => light.kind === "rect-area").length,
    spotCount: rig.lights.filter((light) => light.kind === "spot").length,
    shadowCastingCount: rig.diagnostics.shadowCastingLightCount,
    softboxCount: rig.softboxes.length,
    mountedRootBuilders: rig.lights.map((light) => light.kind === "rect-area" ? "lights.rect" : `lights.${light.kind}`)
  };
}

/**
 * Maps one rig descriptor onto root light builders. Rect-area emitters keep
 * their authored size; every aimed light (spot target, rect look-at) points at
 * the hero subject so the root bridge reproduces the rig geometry.
 */
function mountRigPreset(preset: B5RigPreset): ReturnType<typeof scene> {
  const rig = createLightingRig({ preset });
  const heroTarget = [0, 0.9, 0] as const;
  const builders = rig.lights.map((descriptor) => {
    const color = rgbCss(descriptor.color);
    const position = [...descriptor.position] as [number, number, number];
    switch (descriptor.kind) {
      case "directional":
        return lights.directional({ name: descriptor.id, position, intensity: descriptor.intensity, color });
      case "point":
        return lights.point({ name: descriptor.id, position, intensity: descriptor.intensity, color });
      case "spot":
        return lights.spot({
          name: descriptor.id,
          position,
          target: [position[0] + descriptor.direction[0], position[1] + descriptor.direction[1], position[2] + descriptor.direction[2]],
          angle: descriptor.spotAngle,
          penumbra: descriptor.penumbra,
          distance: descriptor.range,
          intensity: descriptor.intensity,
          color
        });
      case "rect-area":
        return lights.rect({
          name: descriptor.id,
          position,
          intensity: descriptor.intensity,
          color,
          width: descriptor.width,
          height: descriptor.height
        }).lookAt(heroTarget[0], heroTarget[1], heroTarget[2]);
    }
  });
  return heroScene().addMany(builders);
}

function heroScene(): ReturnType<typeof scene> {
  return scene()
    .background("#05070d")
    .camera(camera.orbit({ target: [0, 0.72, 0], distance: 3.2, fov: 34, position: [1.9, 1.45, 2.55] }))
    .add(primitives.sphere({
      name: "b5 hero chrome sphere",
      material: material.chrome({ name: "b5-hero-chrome", color: "#d9e2ea", roughness: 0.12, metallic: 1 })
    }).position(0, 0.9, 0).scale(0.9))
    .add(primitives.box({
      name: "b5 ground slab",
      material: material.pbr({ name: "b5-ground", color: "#11141c", roughness: 0.92, metallic: 0 })
    }).position(0, -0.05, 0).scale([8, 0.1, 8]));
}

function sceneForVariant(id: string): ReturnType<typeof scene> {
  switch (id) {
    case "city64": {
      // 8x8 grid of 64 point lights over a tower block: the root 64-light scene.
      const pointGrid = [];
      for (let ix = 0; ix < 8; ix += 1) {
        for (let iz = 0; iz < 8; iz += 1) {
          pointGrid.push(lights.point({
            name: `b5 city lamp ${ix}-${iz}`,
            position: [(ix - 3.5) * 2.2, 2.4, (iz - 3.5) * 2.2],
            intensity: 2,
            color: (ix + iz) % 2 === 0 ? "#ffd9a0" : "#a0c8ff"
          }));
        }
      }
      return scene()
        .background("#05070d")
        .camera(camera.orbit({ target: [0, 1, 0], distance: 15, fov: 45, position: [10, 8, 12] }))
        .add(primitives.box({
          name: "b5 city ground",
          material: material.pbr({ name: "b5-city-ground", color: "#0d1017", roughness: 0.95, metallic: 0 })
        }).position(0, -0.05, 0).scale([22, 0.1, 22]))
        .add(primitives.box({
          name: "b5 tower a",
          material: material.pbr({ name: "b5-tower-a", color: "#3a4356", roughness: 0.6, metallic: 0.2 })
        }).position(-3, 1.5, -3).scale([2.4, 3, 2.4]))
        .add(primitives.box({
          name: "b5 tower b",
          material: material.pbr({ name: "b5-tower-b", color: "#4a3a52", roughness: 0.6, metallic: 0.2 })
        }).position(3, 2, 3).scale([2.4, 4, 2.4]))
        .add(primitives.sphere({
          name: "b5 city beacon",
          material: material.chrome({ name: "b5-beacon", color: "#d9e2ea", roughness: 0.2, metallic: 1 })
        }).position(0, 1, 0).scale(0.8))
        .addMany(pointGrid);
    }
    case "rig-cinematic-night":
      return mountRigPreset("cinematic-night");
    case "rig-arena-showdown":
      return mountRigPreset("arena-showdown");
    case "rig-product-hero":
      return mountRigPreset("product-hero");
    case "rig-baseline":
      return heroScene().add(lights.ambient({ name: "b5 baseline ambient", intensity: 0.15 }));
    case "rect-on":
      return heroScene()
        .add(lights.ambient({ name: "b5 rect ambient", intensity: 0.15 }))
        .add(lights.rect({
          name: "b5 rect key",
          position: [-2.6, 2.4, 2.8],
          intensity: 6,
          color: "#ffffff",
          width: 3.2,
          height: 1.4
        }).lookAt(0, 0.9, 0));
    case "rect-off":
      return heroScene().add(lights.ambient({ name: "b5 rect ambient", intensity: 0.15 }));
    default:
      throw new Error(`Unknown B5 variant: ${id}`);
  }
}

function readRootCapture(app: ReturnType<typeof createAuraApp>, id: string): { capture: RootVariantCapture; pixels: Uint8Array } {
  const canvas = app.canvas;
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for B5 root proof.");
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const diagnostics = app.diagnostics();
  return {
    capture: {
      id,
      backend: diagnostics.backend,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      pixels: rootPixelMetrics(pixels, width, height)
    },
    pixels
  };
}

function rootPixelMetrics(pixels: Uint8Array, width: number, height: number): RootPixelMetrics {
  // Corner-sampled background: the stage clear color itself is non-black
  // (#05070d sums to 25), so an absolute threshold would count the backdrop.
  const background = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0] as const;
  const buckets = new Set<string>();
  let nonBlackPixels = 0;
  let lumaSum = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]) > 24) {
      nonBlackPixels += 1;
    }
    buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    lumaSum += red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }
  return {
    width,
    height,
    nonBlackPixels,
    colorBuckets: buckets.size,
    meanLuma: Number((lumaSum / Math.max(1, width * height)).toFixed(3)),
    hash: hashPixels(pixels)
  };
}

function compareRootCaptures(variantA: string, variantB: string): RootVariantComparison {
  const first = rootCaptures.get(variantA);
  const second = rootCaptures.get(variantB);
  if (!first || !second) throw new Error(`B5 variants not captured before comparison: ${variantA}, ${variantB}.`);
  let totalDelta = 0;
  let samples = 0;
  let changed = 0;
  const total = Math.min(first.pixels.length, second.pixels.length);
  for (let offset = 0; offset < total; offset += 4) {
    const delta =
      Math.abs((first.pixels[offset] ?? 0) - (second.pixels[offset] ?? 0)) +
      Math.abs((first.pixels[offset + 1] ?? 0) - (second.pixels[offset + 1] ?? 0)) +
      Math.abs((first.pixels[offset + 2] ?? 0) - (second.pixels[offset + 2] ?? 0));
    totalDelta += delta;
    samples += 3;
    if (delta > 24) changed += 1;
  }
  return {
    variantA,
    variantB,
    pixelDelta: Number((totalDelta / Math.max(1, samples)).toFixed(3)),
    changedPixelFraction: Number((changed / Math.max(1, total / 4)).toFixed(4))
  };
}

// ---------------------------------------------------------------------------
// Part 3: true rect-area specular lobe on primitive geometry (forward path).
//
// Root scenes mount rect nodes as bounded spot proxies, so the finite-emitter
// quadrature (a3dPbrRectAreaLight, no LTC) is proven here through the real
// WebGL2 forward path: a metal uvSphere lit by a scene RectAreaLight.
// ---------------------------------------------------------------------------

const RECT_CANVAS_WIDTH = 320;
const RECT_CANVAS_HEIGHT = 200;

async function renderRectPrimitiveProof(): Promise<RectPrimitiveEvidence> {
  try {
    const captures = new Map<string, Uint8Array>();
    const drawCalls: Record<string, number> = {};
    const variants = ["off", "on", "narrow", "wide"] as const;
    for (const variant of variants) {
      const canvas = requiredCanvas(`rect-${variant}`);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width: RECT_CANVAS_WIDTH,
        height: RECT_CANVAS_HEIGHT,
        clearColor: [0.02, 0.025, 0.05, 1],
        preserveDrawingBuffer: true,
        antialias: true
      });
      try {
        const source = rectPrimitiveSource(variant);
        const diagnostics = renderer.render(source, rectPrimitiveCamera());
        renderer.device.setRenderTarget(null);
        captures.set(variant, renderer.device.readPixels(0, 0, RECT_CANVAS_WIDTH, RECT_CANVAS_HEIGHT));
        drawCalls[variant] = diagnostics.drawCalls;
      } finally {
        renderer.dispose();
      }
    }
    const off = requiredRectCapture(captures, "off");
    const on = requiredRectCapture(captures, "on");
    const narrow = requiredRectCapture(captures, "narrow");
    const wide = requiredRectCapture(captures, "wide");
    const offToOn = frameDelta(off, on);
    const narrowToWide = frameDelta(narrow, wide);
    return {
      status: "ready",
      drawCalls,
      offToOnChangedPixels: offToOn.changedPixels,
      offToOnPixelDelta: offToOn.pixelDelta,
      narrowToWideChangedPixels: narrowToWide.changedPixels,
      narrowToWidePixelDelta: narrowToWide.pixelDelta,
      hashes: {
        off: hashPixels(off),
        on: hashPixels(on),
        narrow: hashPixels(narrow),
        wide: hashPixels(wide)
      },
      claimBoundary: "Forward-path rect-area lobe (two-point Gauss-Legendre quadrature over the finite emitter, no LTC lookup tables, no rect shadow maps) proven on primitive sphere geometry with a visible size response; root createAuraApp rect nodes mount as bounded spot proxies and are proven separately."
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
    };
  }
}

function rectPrimitiveSource(variant: "off" | "on" | "narrow" | "wide"): {
  readonly scene: Scene;
  readonly renderItems: readonly RenderItem[];
  readonly environmentLighting: { readonly color: readonly [number, number, number]; readonly intensity: number };
  readonly frustumCulling: false;
} {
  const scene = new Scene();
  if (variant !== "off") {
    const emitter = scene.createLight("rect-area", `b5-rect-${variant}`);
    emitter.intensity = 6;
    emitter.range = 12;
    // Same emitter center and aim for every shape variant; only the emitting
    // area changes, so the narrow/wide delta is a pure size response.
    emitter.transform.setPosition(0, 0.7, -1.4);
    if (variant === "on") {
      emitter.width = 2.4;
      emitter.height = 1.4;
    } else if (variant === "narrow") {
      emitter.width = 0.5;
      emitter.height = 2.4;
    } else {
      emitter.width = 3.6;
      emitter.height = 0.7;
    }
    scene.root.addChild(emitter);
  }
  const items: RenderItem[] = [
    {
      geometry: Geometry.uvSphere(0.7),
      material: new PBRMaterial({
        name: `b5-rect-${variant}-chrome`,
        baseColor: [0.85, 0.87, 0.92, 1],
        metallic: 1,
        roughness: 0.14
      }),
      modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1]),
      label: `b5-rect-${variant}`
    }
  ];
  return {
    scene,
    renderItems: items,
    environmentLighting: { color: [1, 1, 1], intensity: 0.12 },
    frustumCulling: false
  };
}

function rectPrimitiveCamera(): PerspectiveCamera {
  return new PerspectiveCamera({
    fovYRadians: Math.PI / 4,
    aspect: RECT_CANVAS_WIDTH / RECT_CANVAS_HEIGHT,
    near: 0.1,
    far: 30
  });
}

function requiredRectCapture(captures: Map<string, Uint8Array>, variant: string): Uint8Array {
  const capture = captures.get(variant);
  if (!capture) throw new Error(`Missing rect capture: ${variant}.`);
  return capture;
}

function frameDelta(left: Uint8Array, right: Uint8Array): { changedPixels: number; pixelDelta: number } {
  let changedPixels = 0;
  let totalDelta = 0;
  let samples = 0;
  const total = Math.min(left.length, right.length);
  for (let offset = 0; offset < total; offset += 4) {
    const delta =
      Math.abs((left[offset] ?? 0) - (right[offset] ?? 0)) +
      Math.abs((left[offset + 1] ?? 0) - (right[offset + 1] ?? 0)) +
      Math.abs((left[offset + 2] ?? 0) - (right[offset + 2] ?? 0));
    totalDelta += delta;
    samples += 3;
    if (delta > 12) changedPixels += 1;
  }
  return {
    changedPixels,
    pixelDelta: Number((totalDelta / Math.max(1, samples)).toFixed(4))
  };
}

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function rgbCss(color: readonly [number, number, number]): string {
  const channels = color.map((component) => Math.max(0, Math.min(255, Math.round(component * 255))));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function hashPixels(pixels: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of pixels) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function requiredCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas: ${id}`);
  return canvas;
}

function sampleCanvasHash(app: ReturnType<typeof createAuraApp>): string | null {
  const canvas = app.canvas;
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) return null;
  const sampleWidth = Math.min(96, canvas.width);
  const sampleHeight = Math.min(60, canvas.height);
  const x = Math.max(0, Math.floor(canvas.width / 2 - sampleWidth / 2));
  const y = Math.max(0, Math.floor(canvas.height / 2 - sampleHeight / 2));
  const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
  gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return hashPixels(pixels);
}

async function waitForSceneSwap(app: ReturnType<typeof createAuraApp>, outgoing: string | null): Promise<void> {
  if (outgoing === null) return;
  const started = performance.now();
  let changedAt = 0;
  let previous: string | null = outgoing;
  while (performance.now() - started < 8000) {
    app.step(1 / 60);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const current = sampleCanvasHash(app);
    if (current !== outgoing && changedAt === 0) changedAt = performance.now();
    // After the swap, wait for two consecutive identical frames so eased
    // cameras and fire-and-forget upgrades settle before the capture.
    if (changedAt !== 0 && current !== null && current === previous) return;
    previous = current;
  }
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 30_000);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Aura3D B5 harness.");
}
