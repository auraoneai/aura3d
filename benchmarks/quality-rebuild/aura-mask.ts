/**
 * Aura-only object-mask benchmark entry. This page intentionally resolves the
 * native scene translator directly and never loads the mixed benchmark router.
 * Usage: aura-mask.html?scene=aura-native-mask&mask=object-id&dpr=1
 */
import type { RenderDevice, RenderSource } from "@aura3d/rendering";
import type { AuraApp } from "@aura3d/engine";
import type { ReadyPayload, SceneSpec } from "./shared/types";
import { captureNativeObjectMask, type ObjectMaskObject, type ObjectMaskResult } from "./aura3d/lib/mask";
import { waitForFirstDraw } from "./aura3d/lib/failfast";

declare const __AURA3D_VERSION__: string;

const RENDERER = Symbol.for("a3d.prd01.renderer");
const LAST_FRAME = Symbol.for("a3d.benchmark.lastFrame");
const ARM_FRAME = Symbol.for("a3d.benchmark.armFrameSnapshot");

type FrameSource = Pick<RenderSource, "scene" | "geometryLibrary" | "materialLibrary" | "renderItems">;
export type AuraMaskSceneSpec = Omit<SceneSpec, "resolution"> & {
  readonly resolution: { readonly width: number; readonly height: number; readonly devicePixelRatio: number };
};
export interface AuraMaskFrame {
  readonly device: RenderDevice;
  readonly source: FrameSource;
  readonly camera: { readonly viewProjectionMatrix: Float32Array | readonly number[]; readonly layerMask?: number };
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
}

export interface AuraMaskPageState {
  __QR_READY__?: ReadyPayload;
  __QR_ERROR__?: string;
  __QR_MASKS__?: Readonly<Record<string, { readonly dataUrl: string; readonly width: number; readonly height: number; readonly bytes: number }>>;
  __QR_MASK_INDEX__?: readonly string[];
  __QR_OBJECT_IDS__?: readonly ObjectMaskObject[];
  __QR_SPEC__?: { readonly id: string; readonly masks: readonly string[]; readonly dprs?: readonly number[] };
}

export interface AuraMaskPageEnvironment {
  readonly search: string;
  readonly host: HTMLElement;
  readonly state: AuraMaskPageState;
  readonly body: { readonly dataset: DOMStringMap };
  readonly onPageHide: (callback: () => void) => void;
}

export interface AuraMaskPageDependencies {
  readonly getScene: (id: string) => Promise<AuraMaskSceneSpec | undefined>;
  readonly runScene: (spec: AuraMaskSceneSpec, host: HTMLElement, options: {
    readonly dpr: 1 | 2;
    readonly collectExtra: (app: AuraApp) => Readonly<Record<string, unknown>>;
  }) => Promise<ReadyPayload>;
  readonly encodePng: (result: ObjectMaskResult) => string;
  /** Source-only dependency injection; the real page never enables a mock device. */
  readonly allowMockDevice?: boolean;
}

/** Run the actual page flow; dependencies are injectable for source-only tests. */
export async function runAuraMaskPage(environment: AuraMaskPageEnvironment, dependencies: AuraMaskPageDependencies): Promise<void> {
  const { state, host, body } = environment;
  delete state.__QR_READY__;
  delete state.__QR_ERROR__;
  delete state.__QR_MASKS__;
  delete state.__QR_MASK_INDEX__;
  delete state.__QR_OBJECT_IDS__;
  delete state.__QR_SPEC__;
  delete body.dataset.qrReady;
  delete body.dataset.qrError;
  let app: AuraApp | undefined;
  try {
    const params = new URLSearchParams(environment.search);
    const id = params.get("scene") ?? "aura-native-mask";
    const kind = params.get("mask") ?? "object-id";
    if ((params.has("engine") && params.get("engine") !== "aura3d") || (params.has("pass") && params.get("pass") !== "mask")) {
      throw new Error("OBJECT_MASK_ROUTE_UNSUPPORTED: This entry is for the Aura object-mask pass only.");
    }
    if (kind !== "object-id") throw new Error(`OBJECT_MASK_KIND_UNSUPPORTED: ${kind} is not implemented.`);
    const dprValue = params.get("dpr") ?? "1";
    if (dprValue !== "1" && dprValue !== "2") throw new Error("OBJECT_MASK_DPR_INVALID: dpr must be 1 or 2.");
    const dpr = Number(dprValue) as 1 | 2;
    const spec = await dependencies.getScene(id);
    if (!spec) throw new Error(`OBJECT_MASK_SCENE_UNSUPPORTED: Unknown native benchmark scene ${id}.`);
    validateAuraMaskScene(spec);
    host.style.width = `${spec.resolution.width}px`;
    host.style.height = `${spec.resolution.height}px`;
    const payload = await dependencies.runScene(spec, host, {
      dpr,
      collectExtra(mounted) { app = mounted; return {}; }
    });
    if (!app) throw new Error("OBJECT_MASK_APP_UNAVAILABLE: The scene did not expose its settled app.");
    if (payload.engine !== "aura3d" || payload.scene !== spec.id || payload.errors.length > 0) {
      throw new Error("OBJECT_MASK_SCENE_FAILED: The mounted scene did not report a successful matching Aura frame.");
    }
    const owner = (app as unknown as Record<symbol, unknown>)[RENDERER];
    if (!owner || typeof owner !== "object") throw new Error("OBJECT_MASK_FRAME_UNAVAILABLE: Native renderer is not available.");
    const arm = (owner as Record<symbol, unknown>)[ARM_FRAME];
    const accessor = (owner as Record<symbol, unknown>)[LAST_FRAME];
    if (typeof arm !== "function" || typeof accessor !== "function") throw new Error("OBJECT_MASK_FRAME_UNAVAILABLE: Native frame snapshot is unavailable.");
    // Arm only this capture: ordinary app frames must not copy/hash geometry.
    // The benchmark uses autoStart:false and this entire transaction is sync.
    const disarm = arm.call(owner);
    if (typeof disarm !== "function") throw new Error("OBJECT_MASK_FRAME_UNAVAILABLE: Snapshot did not provide a release function.");
    let result: ObjectMaskResult;
    try {
      app.step(0);
      const frame = accessor.call(owner) as AuraMaskFrame;
      if (!frame || !frame.device || !frame.source || !frame.camera?.viewProjectionMatrix || !frame.canvas || frame.width !== frame.canvas.width || frame.height !== frame.canvas.height) {
        throw new Error("OBJECT_MASK_FRAME_UNAVAILABLE: The native frame snapshot is incomplete or stale.");
      }
      if (frame.device.kind === "mock" && dependencies.allowMockDevice !== true) {
        throw new Error("OBJECT_MASK_BACKEND_UNSUPPORTED: A mock device cannot provide rasterized pixels.");
      }
      const webgl2Context = frame.device.kind === "webgl2" ? frame.canvas.getContext("webgl2") ?? undefined : undefined;
      result = captureNativeObjectMask({
        device: frame.device, source: frame.source, width: frame.width, height: frame.height,
        viewProjectionMatrix: frame.camera.viewProjectionMatrix,
        ...(frame.camera.layerMask === undefined ? {} : { cameraLayerMask: frame.camera.layerMask }),
        ...(webgl2Context ? { webgl2Context } : {})
      });
    } catch (error) {
      try { disarm(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Object-mask capture and snapshot release failed."); }
      throw error;
    }
    disarm();
    const dataUrl = dependencies.encodePng(result);
    const png = /^data:image\/png;base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
    if (!png || png[1]!.length === 0 || png[1]!.length % 4 !== 0) throw new Error("OBJECT_MASK_PNG_INVALID: PNG encoding failed.");
    const encoded = png[1]!;
    const bytes = encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
    const mountedApp = app;
    environment.onPageHide(() => mountedApp.dispose());
    state.__QR_SPEC__ = { id: spec.id, masks: ["object-id"], ...(spec.dprs ? { dprs: spec.dprs } : {}) };
    state.__QR_MASK_INDEX__ = ["object-id"];
    state.__QR_OBJECT_IDS__ = result.objects;
    state.__QR_MASKS__ = { "object-id": { dataUrl, width: result.width, height: result.height, bytes } };
    state.__QR_READY__ = payload;
    body.dataset.qrReady = "true";
  } catch (error) {
    // A failed route owns its app, but must not dispose any borrowed renderer
    // resources itself. Preserve both the original error and disposal failure.
    try { app?.dispose(); } catch (disposeError) { error = new AggregateError([error, disposeError], "Object-mask route failed and app cleanup failed."); }
    delete state.__QR_READY__;
    delete state.__QR_MASKS__;
    delete state.__QR_MASK_INDEX__;
    delete state.__QR_OBJECT_IDS__;
    delete state.__QR_SPEC__;
    delete body.dataset.qrReady;
    state.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    body.dataset.qrError = "true";
  }
}

/** Convert bottom-left native readback to an upright, lossless PNG. */
export function objectMaskPng(result: ObjectMaskResult, createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): string {
  if (!Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) || result.width <= 0 || result.height <= 0 || result.rgba.length !== result.width * result.height * 4) {
    throw new Error("OBJECT_MASK_PNG_INVALID: Pixel dimensions do not match the RGBA data.");
  }
  const canvas = createCanvas();
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("OBJECT_MASK_PNG_UNSUPPORTED: Canvas 2D is unavailable.");
  const image = context.createImageData(result.width, result.height);
  const stride = result.width * 4;
  for (let y = 0; y < result.height; y += 1) {
    const source = (result.height - 1 - y) * stride;
    image.data.set(result.rgba.subarray(source, source + stride), y * stride);
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * This is a mask-only abstract geometry fixture. Geometry, transforms and
 * camera come from the requested benchmark specification. It does not claim
 * look parity: detailed shadow-map settings and display grading do not affect
 * object identity and are reported as outside this fixture's scope.
 */
export function validateAuraMaskScene(spec: AuraMaskSceneSpec): void {
  if (spec.objects.some((object) => object.kind === "model") || spec.environment || spec.background.kind === "hdri") {
    throw new Error("OBJECT_MASK_ASSET_UNSUPPORTED: This independent route currently accepts asset-free scenes only.");
  }
  if (spec.objects.length === 0 || spec.objects.some((object) => object.kind !== "primitive") || spec.lights.some((light) => light.kind !== "ambient" && light.kind !== "directional") ||
      spec.bloom || spec.fog || spec.csm || spec.showcase || spec.terrain || spec.qrFlags?.length ||
      (spec as AuraMaskSceneSpec & { readonly postExtras?: unknown }).postExtras || spec.toneMapping !== "aces-filmic" || spec.exposure !== 1) {
    throw new Error("OBJECT_MASK_SCENE_UNSUPPORTED: This fixture supports opaque primitives, a fixed camera and ambient/directional lights only.");
  }
  if (!Number.isFinite(spec.time) || spec.time < 0 || !Number.isSafeInteger(spec.settleFrames) || spec.settleFrames < 0 || spec.settleFrames > 1200) {
    throw new Error("OBJECT_MASK_SCENE_UNSUPPORTED: Capture time or settle frame count is invalid.");
  }
  for (const object of spec.objects) {
    if (object.kind !== "primitive") continue;
    const options = object.material;
    const supported = new Set(["color", "roughness", "metalness", "opacity"]);
    if (Object.keys(options).some((key) => !supported.has(key)) || (options.opacity !== undefined && options.opacity !== 1)) {
      throw new Error(`OBJECT_MASK_SCENE_UNSUPPORTED: ${object.name} uses a material outside the opaque primitive subset.`);
    }
  }
}

type AuraSceneApi = Pick<typeof import("@aura3d/engine"), "camera" | "lights" | "material" | "primitives" | "scene">;

/** Independently construct the supported subset with the native public API. */
export function buildAuraMaskScene(spec: AuraMaskSceneSpec, api: AuraSceneApi): ReturnType<AuraSceneApi["scene"]> {
  validateAuraMaskScene(spec);
  if (spec.background.kind !== "color") throw new Error("OBJECT_MASK_ASSET_UNSUPPORTED: A color background is required.");
  const stage = api.scene({ background: spec.background.color });
  stage.camera(api.camera.perspective({ ...spec.camera }));
  for (const light of spec.lights) {
    if (light.kind === "ambient") {
      stage.add(api.lights.ambient({ name: light.name, color: light.color, intensity: light.intensity }));
    } else if (light.kind === "directional") {
      stage.add(api.lights.directional({ name: light.name, color: light.color, intensity: light.intensity, position: light.position, target: light.target, shadow: light.castShadow }));
    }
  }
  for (const object of spec.objects) {
    if (object.kind !== "primitive") throw new Error("OBJECT_MASK_SCENE_UNSUPPORTED: A primitive object is required.");
    let node = api.primitives[object.shape]({
      name: object.name, size: object.size, castShadow: object.castShadow, receiveShadow: object.receiveShadow,
      material: api.material.pbr({ color: object.material.color, roughness: object.material.roughness, metallic: object.material.metalness })
    }).position(...object.position);
    if (object.rotation) node = node.rotate(...object.rotation);
    if (object.scale !== undefined) node = node.scale(object.scale);
    stage.add(node);
  }
  return stage;
}

// This is a distinct Aura-only fixture, authored for exercising identity and
// occlusion without loading the historical comparison scene registry.
const auraNativeMaskScene: AuraMaskSceneSpec = {
  id: "aura-native-mask", index: 0, title: "Aura native object mask", purpose: "Exercise opaque object identity and depth.",
  resolution: { width: 640, height: 480, devicePixelRatio: 1 },
  camera: { position: [4, 3, 6], target: [0, 0, 0], fov: 50, near: 0.1, far: 100 },
  background: { kind: "color", color: "#111827" }, toneMapping: "aces-filmic", exposure: 1,
  lights: [{ kind: "ambient", name: "fill", color: "#ffffff", intensity: 1 }],
  objects: [
    { kind: "primitive", name: "mask-ground", shape: "plane", size: [8, 1, 8], position: [0, -1, 0], material: { color: "#777777", roughness: 0.8, metalness: 0 }, castShadow: false, receiveShadow: false },
    { kind: "primitive", name: "mask-cube", shape: "box", size: [1.2, 1.2, 1.2], position: [-1, 0, 0], material: { color: "#cc4433", roughness: 0.7, metalness: 0 }, castShadow: false, receiveShadow: false },
    { kind: "primitive", name: "mask-orb", shape: "sphere", size: [1.4, 1.4, 1.4], position: [1.2, 0, 0], material: { color: "#3388bb", roughness: 0.6, metalness: 0 }, castShadow: false, receiveShadow: false }
  ],
  time: 0, settleFrames: 0, masks: ["object-id"], dprs: [1, 2]
};

export const auraMaskPageDependencies: AuraMaskPageDependencies = {
  async getScene(id) { return id === auraNativeMaskScene.id ? auraNativeMaskScene : undefined; },
  async runScene(spec, host, options) {
    const started = performance.now();
    const api = await import("@aura3d/engine");
    const scene = buildAuraMaskScene(spec, api);
    const app = api.createAuraApp(host, {
      scene, autoStart: false, resize: false, pixelRatio: options.dpr,
      renderer: { qualityProfile: "production" }
    });
    options.collectExtra(app);
    await app.readyStrict();
    await waitForFirstDraw(app, 90_000);
    app.step(spec.time);
    for (let frame = 0; frame < spec.settleFrames; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      app.step(0);
    }
    // The mount's symbol handoff completes asynchronously after its first draw.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const diagnostics = app.diagnostics();
    return {
      engine: "aura3d", scene: spec.id, engineVersion: __AURA3D_VERSION__,
      capabilityLog: [{ feature: "object-mask-fixture", status: "partial", detail: "Native opaque geometry and camera; detailed shadow settings and display grading are outside this mask fixture." }],
      drawCalls: diagnostics.drawCalls, warnings: [...diagnostics.warnings], errors: [...diagnostics.errors],
      loadMs: Math.round(performance.now() - started), dpr: options.dpr
    };
  },
  encodePng: objectMaskPng
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const host = document.getElementById("stage");
  const state = window as unknown as AuraMaskPageState;
  if (!host) {
    state.__QR_ERROR__ = "OBJECT_MASK_STAGE_MISSING: Missing #stage.";
    document.body.dataset.qrError = "true";
  } else {
    void runAuraMaskPage({
      search: window.location.search, host, state, body: document.body,
      onPageHide: (callback) => window.addEventListener("pagehide", callback, { once: true })
    }, auraMaskPageDependencies);
  }
}
