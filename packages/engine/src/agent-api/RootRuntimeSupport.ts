import { frustumMat4, multiplyMat4, orthographicMat4, perspectiveMat4, type Mat4 } from "@aura3d/scene/math";
import type { RenderDeviceDiagnostics, RenderItem, RenderSource } from "@aura3d/rendering";
import { geometry } from "./nodes/geometry.js";
import { instances } from "./nodes/instances.js";

export function composeModelInstanceMatrices(instances: Float32Array, meshLocal: ArrayLike<number>): Float32Array {
  if (instances.length % 16 !== 0 || meshLocal.length !== 16) throw new Error("Model instance matrices must contain complete 4x4 matrices");
  const output = new Float32Array(instances.length);
  const local = Array.from(meshLocal) as unknown as Mat4;
  for (let offset = 0; offset < instances.length; offset += 16) {
    const root = Array.from(instances.subarray(offset, offset + 16)) as unknown as Mat4;
    output.set(multiplyMat4(root, local), offset);
  }
  return output;
}

export interface CameraClippingOptions {
  readonly near?: number;
  readonly far?: number;
  readonly mode?: string;
  readonly depth?: { readonly mode?: "standard" | "reversed" | "logarithmic"; readonly clipRange?: "minus-one-to-one" | "zero-to-one"; readonly allowFallback?: boolean };
}
export function resolveCameraClipping(options: CameraClippingOptions): { near: number; far: number } {
  const near = options.near ?? 0.05;
  const far = options.far ?? 100;
  const orthographic = options.mode === "orthographic" || options.mode === "isometric";
  // Range-only consumers may omit the projection mode. In that case, accept
  // only ranges valid for at least one projection; camera builders and
  // projection entry points must supply the actual mode.
  const perspective = options.mode !== undefined && !orthographic;
  const depthMode = options.depth?.mode ?? "standard";
  if (depthMode !== "standard" && depthMode !== "reversed" && depthMode !== "logarithmic") throw new RangeError("Invalid camera depth mode.");
  if (!Number.isFinite(near) || ((perspective || depthMode === "logarithmic" || far === Infinity) && near <= 0)
    || (far !== Infinity && !Number.isFinite(far)) || far <= near
    || (far === Infinity && (orthographic || depthMode === "logarithmic"))) {
    throw new RangeError("Camera clipping requires near < far; perspective and logarithmic depth require near > 0, and infinite far requires non-logarithmic perspective.");
  }
  return { near, far };
}
export interface RootCameraViewOffset {
  readonly fullWidth: number; readonly fullHeight: number;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}
export interface RootCameraProjectionOptions extends CameraClippingOptions {
  readonly mode: string;
  readonly fov?: number;
  readonly orthographicSize?: number;
  /** Physical focal length takes precedence over the vertical FOV when supplied. */
  readonly focalLength?: number;
  readonly filmGauge?: number;
  readonly filmOffset?: number;
  readonly viewOffset?: RootCameraViewOffset;
}

export function createCameraProjection(options: RootCameraProjectionOptions, aspect: number): ReturnType<typeof perspectiveMat4> {
  const { near, far } = resolveCameraClipping(options);
  if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError("Camera aspect must be finite and positive.");
  const offset = options.viewOffset;
  if (offset && (![offset.fullWidth, offset.fullHeight, offset.x, offset.y, offset.width, offset.height].every(Number.isFinite)
    || offset.fullWidth <= 0 || offset.fullHeight <= 0 || offset.width <= 0 || offset.height <= 0
    || offset.x < 0 || offset.y < 0 || offset.x + offset.width > offset.fullWidth || offset.y + offset.height > offset.fullHeight)) {
    throw new RangeError("Camera view offset must be a positive rectangle inside the full image.");
  }
  // A view tile uses the aspect of the full image, not that of the tile.
  const fullAspect = offset ? offset.fullWidth / offset.fullHeight : aspect;
  const depth = { mode: options.depth?.mode ?? "standard", clipRange: options.depth?.clipRange ?? "minus-one-to-one" } as const;
  const orthographic = options.mode === "orthographic" || options.mode === "isometric";
  let halfHeight: number;
  let shift = 0;
  if (orthographic) {
    halfHeight = options.orthographicSize ?? 1.4;
    if (!Number.isFinite(halfHeight) || halfHeight <= 0) throw new RangeError("Orthographic camera size must be finite and positive.");
  } else {
    const gauge = options.filmGauge ?? 35;
    const filmOffset = options.filmOffset ?? 0;
    if (!Number.isFinite(gauge) || gauge <= 0 || !Number.isFinite(filmOffset)) throw new RangeError("Camera film gauge must be positive and film offset finite.");
    const focal = options.focalLength;
    if (focal !== undefined && (!Number.isFinite(focal) || focal <= 0)) throw new RangeError("Camera focal length must be finite and positive.");
    const fov = focal === undefined ? (options.fov ?? 45) * Math.PI / 180 : 2 * Math.atan((gauge / Math.max(fullAspect, 1)) / (2 * focal));
    if (!Number.isFinite(fov) || fov <= 0 || fov >= Math.PI) throw new RangeError("Camera field of view must be between 0 and 180 degrees.");
    halfHeight = near * Math.tan(fov / 2);
    shift = 2 * halfHeight * fullAspect * filmOffset / (gauge * Math.min(fullAspect, 1));
  }
  const halfWidth = halfHeight * fullAspect;
  let left = -halfWidth + shift, right = halfWidth + shift, bottom = -halfHeight, top = halfHeight;
  if (offset) {
    const width = right - left, height = top - bottom;
    const fullLeft = left, fullTop = top;
    left = fullLeft + width * offset.x / offset.fullWidth;
    right = fullLeft + width * (offset.x + offset.width) / offset.fullWidth;
    bottom = fullTop - height * (offset.y + offset.height) / offset.fullHeight;
    top = fullTop - height * offset.y / offset.fullHeight;
  }
  return orthographic
    ? orthographicMat4(left, right, bottom, top, near, far, depth)
    : frustumMat4(left, right, bottom, top, near, far, depth);
}

export class DeferredFrameResources {
  private pending = 0;
  private disposed = false;
  private released = false;
  private resizePending = false;
  constructor(private readonly release: () => void, private readonly resize: () => void) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) throw new Error("Aura3D renderer is disposed.");
    this.pending++;
    try { return await operation(); } finally { this.pending--; this.flush(); }
  }
  requestResize(): void { if (!this.disposed) { this.resizePending = true; this.flush(); } }
  dispose(): void { this.disposed = true; this.flush(); }
  private flush(): void {
    if (this.pending !== 0) return;
    if (this.disposed) {
      if (this.released) return;
      this.released = true;
      this.resizePending = false;
      this.release();
    } else if (this.resizePending) {
      this.resizePending = false;
      this.resize();
    }
  }
}

export function readRootDiagnosticSnapshot<T>(previous: T, read: (() => T | undefined) | undefined, disposed: boolean, busy: boolean): T {
  if (disposed || busy || !read) return structuredClone(previous);
  return structuredClone(read() ?? previous);
}
export function resolveRootRenderTime(suppliedTime: number, explicit: boolean, isPaused: () => boolean, pausedRenderTime: () => number): number {
  return explicit || !isPaused() ? suppliedTime : pausedRenderTime();
}

export interface AuraPerformanceQuality { readonly resolutionScale: number; readonly particleScale: number; readonly lodBias: number; readonly shadowSize: number }
const quality = new WeakMap<HTMLCanvasElement, AuraPerformanceQuality>();
const particles = new WeakMap<HTMLCanvasElement, (scale: number) => void>();
const baseSizes = new WeakMap<HTMLCanvasElement, { readonly width: number; readonly height: number }>();
export function validateRootPerformanceQuality(value: AuraPerformanceQuality): AuraPerformanceQuality {
  if (!Number.isFinite(value.resolutionScale) || value.resolutionScale <= 0 || value.resolutionScale > 1
    || !Number.isFinite(value.particleScale) || value.particleScale <= 0 || value.particleScale > 1
    || !Number.isFinite(value.lodBias) || value.lodBias < 1 || value.lodBias > 8
    || !Number.isInteger(value.shadowSize) || value.shadowSize < 256 || value.shadowSize > 4096
    || (value.shadowSize & (value.shadowSize - 1)) !== 0) throw new Error("PERFORMANCE_QUALITY_INVALID: scales must be in (0,1], LOD bias in [1,8], and shadow size a power of two in [256,4096].");
  return Object.freeze({ ...value });
}
export function getRootPerformanceQuality(canvas: HTMLCanvasElement): AuraPerformanceQuality | undefined { return quality.get(canvas); }
export function setRootPerformanceQuality(canvas: HTMLCanvasElement, value: AuraPerformanceQuality): void { quality.set(canvas, validateRootPerformanceQuality(value)); }
export function registerRootParticleQualityConsumer(canvas: HTMLCanvasElement, apply: (scale: number) => void): () => void {
  if (particles.has(canvas)) throw new Error("A root particle quality consumer already exists for this canvas.");
  particles.set(canvas, apply);
  return () => { if (particles.get(canvas) === apply) particles.delete(canvas); };
}
export function supportsRootParticleQuality(canvas: HTMLCanvasElement): boolean { return particles.has(canvas); }
export function applyRootParticleQuality(canvas: HTMLCanvasElement, scale: number): void { particles.get(canvas)?.(scale); }
export function initializeRootPerformanceQuality(canvas: HTMLCanvasElement): void { quality.delete(canvas); baseSizes.set(canvas, { width: canvas.width, height: canvas.height }); }
export function getRootPerformanceBaseSize(canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } { return baseSizes.get(canvas) ?? { width: canvas.width, height: canvas.height }; }

export interface RootRenderSourceBridge { readonly source: RenderSource; readonly onFrame?: (diagnostics: RenderDeviceDiagnostics, submittedItems: readonly RenderItem[]) => void }
interface RootBridgeRegistration {
  readonly bridge: RootRenderSourceBridge;
  owner?: object;
  scopedView?: RootRenderSourceBridge;
}
interface RootBridgeRegistry {
  legacy?: RootBridgeRegistration;
  readonly owned: Map<object, RootBridgeRegistration>;
}
interface ManagedRootApp {
  readonly canvas: HTMLCanvasElement;
  readonly owner: object;
  app?: object;
}
interface RootOverlayRegistration {
  readonly source: RenderSource;
  bound: boolean;
  cachedBase?: RootBridgeRegistration;
  cachedView?: RootRenderSourceBridge;
}
interface RootOverlayRegistry {
  standalone?: RootOverlayRegistration;
  readonly owned: Map<object, RootOverlayRegistration>;
}
const bridges = new WeakMap<HTMLCanvasElement, RootBridgeRegistry>();
const overlays = new WeakMap<HTMLCanvasElement, RootOverlayRegistry>();
const canvasApps = new WeakMap<HTMLCanvasElement, Map<object, ManagedRootApp>>();
const ownerApps = new WeakMap<object, ManagedRootApp>();
const appOwners = new WeakMap<object, ManagedRootApp>();
const usedOwners = new WeakSet<object>();

// Canvas sizing and render-path selection happen before an async renderer
// exists. Reserve that earlier app boundary as well as the backend device.
// WebGL-only apps retain their existing shared-canvas behavior; a WebGPU or
// auto attempt is exclusive even while its backend is still being selected.
const rootCanvasAdmissions = new WeakMap<HTMLCanvasElement, Map<object, boolean>>();

export function reserveRootCanvas(canvas: HTMLCanvasElement, owner: object, exclusive: boolean): { release(): void } | undefined {
  let admissions = rootCanvasAdmissions.get(canvas);
  if (admissions && (exclusive || [...admissions.values()].some(Boolean))) return undefined;
  if (!admissions) rootCanvasAdmissions.set(canvas, (admissions = new Map()));
  admissions.set(owner, exclusive);
  const ownedAdmissions = admissions;
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      ownedAdmissions.delete(owner);
      if (ownedAdmissions.size === 0 && rootCanvasAdmissions.get(canvas) === ownedAdmissions) rootCanvasAdmissions.delete(canvas);
    }
  };
}

function bridgeRegistry(canvas: HTMLCanvasElement): RootBridgeRegistry {
  let registry = bridges.get(canvas);
  if (!registry) bridges.set(canvas, (registry = { owned: new Map() }));
  return registry;
}

function retireBridgeRegistry(canvas: HTMLCanvasElement, registry: RootBridgeRegistry): void {
  if (!registry.legacy && registry.owned.size === 0 && bridges.get(canvas) === registry) bridges.delete(canvas);
}

/**
 * Reserve a private owner before the initial mount, then authenticate the public
 * app identity when it exists. The lease, including any legacy base it claims,
 * cannot be transferred to another app or removed by an older disposer.
 */
export function registerManagedRootApp(canvas: HTMLCanvasElement, owner: object): {
  readonly bindApp: (app: object) => void;
  readonly release: () => void;
} {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null ||
      owner === canvas || usedOwners.has(owner)) throw new Error("ROOT_SOURCE_OWNER_MISMATCH");
  let apps = canvasApps.get(canvas);
  if (!apps) canvasApps.set(canvas, (apps = new Map()));
  const registration: ManagedRootApp = { canvas, owner };
  apps.set(owner, registration);
  ownerApps.set(owner, registration);
  usedOwners.add(owner);
  // A bridge installed before the app has exactly one possible managed owner.
  // Once claimed it stays with that lease, even if another app later appears.
  const base = bridges.get(canvas)?.legacy;
  if (apps.size === 1 && base && base.owner === undefined) base.owner = owner;
  let released = false;
  return {
    bindApp(app) {
      if (released || apps.get(owner) !== registration || ownerApps.get(owner) !== registration ||
          (registration.app !== undefined && registration.app !== app) ||
          (appOwners.has(app) && appOwners.get(app) !== registration)) {
        throw new Error("ROOT_SOURCE_APP_OWNER_MISMATCH");
      }
      registration.app = app;
      appOwners.set(app, registration);
    },
    release() {
      if (released) return;
      released = true;
      // Retain the weak app identity association after release so a stale app
      // object can never be rebound as a different owner's public handle.
      if (ownerApps.get(owner) === registration) ownerApps.delete(owner);
      if (apps.get(owner) === registration) apps.delete(owner);
      if (apps.size === 0 && canvasApps.get(canvas) === apps) canvasApps.delete(canvas);
      const registry = bridges.get(canvas);
      if (!registry) return;
      if (registry.legacy?.owner === owner) registry.legacy = undefined;
      registry.owned.delete(owner);
      retireBridgeRegistry(canvas, registry);
    }
  };
}

function overlayRegistry(canvas: HTMLCanvasElement): RootOverlayRegistry {
  let registry = overlays.get(canvas);
  if (!registry) overlays.set(canvas, (registry = { owned: new Map() }));
  return registry;
}

function retireOverlayRegistry(canvas: HTMLCanvasElement, registry: RootOverlayRegistry): void {
  if (!registry.standalone && registry.owned.size === 0 && overlays.get(canvas) === registry) overlays.delete(canvas);
}
/**
 * Attach app-drawn render items (a TypedGLBActor driven outside the scene graph, a custom mesh
 * batch) to the canvas's frame. The items join the frame's single item list ahead of the scene's,
 * so they are lit, shadowed and post-processed like scene items: they cast sun and local shadows
 * unless an item says `castShadow: false`, and receive the shadow map and the contact-shadow mask
 * unless it says `receiveShadow: false` (GU47 E-H verified; `tests/unit/gu47/eh/root-source-shadows.test.ts`).
 */
export function attachRootRenderSource(canvas: HTMLCanvasElement, bridge: RootRenderSourceBridge, app?: object): () => void {
  const registry = bridgeRegistry(canvas);
  if (app !== undefined) {
    // Public callers identify their app, not its private runtime owner.
    const managed = appOwners.get(app);
    if (!managed || managed.canvas !== canvas || ownerApps.get(managed.owner) !== managed ||
        canvasApps.get(canvas)?.get(managed.owner) !== managed) {
      retireBridgeRegistry(canvas, registry);
      throw new Error("ROOT_SOURCE_APP_OWNER_MISMATCH");
    }
    const owner = managed.owner;
    if (registry.owned.has(owner) || registry.legacy?.owner === owner) {
      throw new Error("An app already has a production-runtime source bridge.");
    }
    const registration: RootBridgeRegistration = { bridge, owner };
    registry.owned.set(owner, registration);
    return () => {
      if (registry.owned.get(owner) === registration) registry.owned.delete(owner);
      retireBridgeRegistry(canvas, registry);
    };
  }
  if (registry.legacy) throw new Error("A canvas already has a production-runtime source bridge.");
  const apps = canvasApps.get(canvas);
  if ((apps?.size ?? 0) > 1) {
    retireBridgeRegistry(canvas, registry);
    throw new Error("ROOT_SOURCE_OWNER_AMBIGUOUS");
  }
  const owner = apps?.values().next().value?.owner;
  if (owner && registry.owned.has(owner)) throw new Error("An app already has a production-runtime source bridge.");
  const registration: RootBridgeRegistration = { bridge, owner };
  registry.legacy = registration;
  return () => {
    if (registry.legacy === registration) registry.legacy = undefined;
    retireBridgeRegistry(canvas, registry);
  };
}

/** The standalone canvas slot remains exclusive and independent of app-owned overlays. */
export function attachRootRenderSourceOverlay(canvas: HTMLCanvasElement, overlay: RenderSource): () => void {
  const registry = overlayRegistry(canvas);
  if (registry.standalone) throw new Error("A canvas already has a production-runtime source overlay.");
  const registration: RootOverlayRegistration = { source: overlay, bound: true };
  registry.standalone = registration;
  return () => {
    if (registry.standalone !== registration) return;
    registry.standalone = undefined;
    retireOverlayRegistry(canvas, registry);
  };
}

/**
 * An app bridge starts in a private provisional slot. Only its lease can move
 * that exact registration to the app's sealed runtime owner. The move cannot
 * replace another registration and the old disposer cannot remove a new one.
 */
export function attachOwnedRootRenderSourceOverlay(canvas: HTMLCanvasElement, overlay: RenderSource, provisionalOwner: object): {
  readonly bindOwner: (owner: object) => void;
  readonly detach: () => void;
} {
  const registry = overlayRegistry(canvas);
  if (registry.owned.has(provisionalOwner)) throw new Error("A runtime owner already has a production-runtime source overlay.");
  const registration: RootOverlayRegistration = { source: overlay, bound: false };
  let currentOwner = provisionalOwner;
  let sealedOwner: object | undefined;
  let detached = false;
  registry.owned.set(currentOwner, registration);
  return {
    bindOwner(owner) {
      if (detached || registry.owned.get(currentOwner) !== registration) throw new Error("VFX_OVERLAY_BINDING_REVOKED");
      if (sealedOwner !== undefined) {
        if (sealedOwner !== owner) throw new Error("VFX_OVERLAY_OWNER_MISMATCH");
        return;
      }
      const existing = registry.owned.get(owner);
      if (existing && existing !== registration) throw new Error("VFX_OVERLAY_OWNER_CONFLICT");
      if (currentOwner !== owner) {
        registry.owned.set(owner, registration);
        registry.owned.delete(currentOwner);
        currentOwner = owner;
      }
      sealedOwner = owner;
      registration.bound = true;
    },
    detach() {
      if (detached) return;
      detached = true;
      if (registry.owned.get(currentOwner) === registration) registry.owned.delete(currentOwner);
      retireOverlayRegistry(canvas, registry);
    }
  };
}

/** Used to authenticate the system's mount handoff against the actual owner slot. */
export function ownedRootRenderSourceOverlay(canvas: HTMLCanvasElement, owner: object): RenderSource | undefined {
  if (usedOwners.has(owner) && ownerApps.get(owner)?.canvas !== canvas) return undefined;
  const registration = overlays.get(canvas)?.owned.get(owner);
  return registration?.bound ? registration.source : undefined;
}
function mergeRootRenderSource(base: RootRenderSourceBridge | undefined, overlay: RenderSource): RootRenderSourceBridge {
  const source = {} as RenderSource;
  // Descriptors (not values) so getter-backed feeds stay live per frame.
  if (base) Object.defineProperties(source, Object.getOwnPropertyDescriptors(base.source));
  Object.defineProperties(source, Object.getOwnPropertyDescriptors(overlay));
  if (base && "collectedLights" in base.source && "collectedLights" in overlay) {
    Object.defineProperty(source, "collectedLights", {
      enumerable: true,
      configurable: true,
      get: () => [...(base.source.collectedLights ?? []), ...(overlay.collectedLights ?? [])]
    });
  }
  return base?.onFrame ? { source, onFrame: base.onFrame } : { source };
}
export function getRootRenderSource(canvas: HTMLCanvasElement, owner?: object): RootRenderSourceBridge | undefined {
  const standalone = owner === undefined || owner === canvas;
  if (!standalone && usedOwners.has(owner) && ownerApps.get(owner)?.canvas !== canvas) return undefined;
  const registry = overlays.get(canvas);
  const overlay = standalone ? registry?.standalone : registry?.owned.get(owner);
  const bases = bridges.get(canvas);
  const legacy = bases?.legacy;
  const base = standalone
    ? legacy?.owner === undefined ? legacy : undefined
    : bases?.owned.get(owner) ?? (legacy?.owner === owner ? legacy : undefined);
  const activeOverlay = overlay?.bound ? overlay : undefined;
  if (!activeOverlay) {
    if (!base) return undefined;
    // An owner-scoped view identifies this registration generation, even if
    // the same caller-owned bridge object is detached and attached again.
    if (owner === undefined) return base.bridge;
    return base.scopedView ??= {
      source: base.bridge.source,
      ...(base.bridge.onFrame ? { onFrame: base.bridge.onFrame } : {})
    };
  }
  if (!activeOverlay.cachedView || activeOverlay.cachedBase !== base) {
    activeOverlay.cachedBase = base;
    activeOverlay.cachedView = mergeRootRenderSource(base?.bridge, activeOverlay.source);
  }
  return activeOverlay.cachedView;
}
export function hasRootRenderableContent(canvas: HTMLCanvasElement | undefined, hasPublicGeometry: boolean, owner?: object): boolean {
  if (hasPublicGeometry) return true;
  if (!canvas) return false;
  const standalone = owner === undefined || owner === canvas;
  if (!standalone && usedOwners.has(owner) && ownerApps.get(owner)?.canvas !== canvas) return false;
  const bases = bridges.get(canvas);
  const legacy = bases?.legacy;
  const overlay = overlays.get(canvas);
  return standalone
    ? Boolean((legacy && legacy.owner === undefined) || overlay?.standalone?.bound)
    : Boolean(bases?.owned.has(owner) || legacy?.owner === owner || overlay?.owned.get(owner)?.bound);
}
export function includeRootSourceMetadata<T extends { meshCount: number; primitiveCount: number; materialCount: number; runtimeMaterialCount?: number }>(metadata: T, attachedItems: readonly RenderItem[]): T {
  const renderable = attachedItems.filter(item => item.geometry && item.material);
  if (!renderable.length) return metadata;
  const liveMaterials = new Set(renderable.flatMap(({ material }) => {
    if (!material) return [];
    const base = "baseMaterial" in material ? material.baseMaterial : material;
    return base.disposed ? [] : [material];
  }));
  return {
    ...metadata,
    ...("assetId" in metadata && metadata.primitiveCount === 0 ? { assetId: "production-runtime-attached-source", assetUri: "aura3d://production-runtime/attached-source" } : {}),
    meshCount: metadata.meshCount + new Set(renderable.map(item => item.geometry)).size,
    primitiveCount: metadata.primitiveCount + renderable.length,
    materialCount: metadata.materialCount + new Set(renderable.map(item => item.material)).size,
    ...(metadata.runtimeMaterialCount === undefined ? {} : { runtimeMaterialCount: metadata.runtimeMaterialCount + liveMaterials.size })
  };
}
