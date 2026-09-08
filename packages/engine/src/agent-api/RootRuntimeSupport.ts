import { multiplyMat4, orthographicMat4, perspectiveMat4, type Mat4 } from "@aura3d/scene/math";
import type { RenderDeviceDiagnostics, RenderItem, RenderSource } from "@aura3d/rendering";

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

export interface CameraClippingOptions { readonly near?: number; readonly far?: number }
export function resolveCameraClipping(options: CameraClippingOptions): { near: number; far: number } {
  const near = options.near ?? 0.05;
  const far = options.far ?? 100;
  if (!Number.isFinite(near) || near <= 0 || !Number.isFinite(far) || far <= near) throw new RangeError("Camera clipping planes require finite 0 < near < far.");
  return { near, far };
}
export function createCameraProjection(options: CameraClippingOptions & { readonly mode: string; readonly fov?: number; readonly orthographicSize?: number }, aspect: number): ReturnType<typeof perspectiveMat4> {
  const { near, far } = resolveCameraClipping(options);
  const halfHeight = Math.max(1e-4, options.orthographicSize ?? 1.4);
  const halfWidth = Math.max(1e-4, halfHeight * aspect);
  return options.mode === "orthographic" || options.mode === "isometric"
    ? orthographicMat4(-halfWidth, halfWidth, -halfHeight, halfHeight, near, far)
    : perspectiveMat4(((options.fov ?? 45) * Math.PI) / 180, aspect, near, far);
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
const bridges = new WeakMap<HTMLCanvasElement, RootRenderSourceBridge>();
export function attachRootRenderSource(canvas: HTMLCanvasElement, bridge: RootRenderSourceBridge): () => void {
  if (bridges.has(canvas)) throw new Error("A canvas already has a production-runtime source bridge.");
  bridges.set(canvas, bridge);
  return () => { if (bridges.get(canvas) === bridge) bridges.delete(canvas); };
}
export function getRootRenderSource(canvas: HTMLCanvasElement): RootRenderSourceBridge | undefined { return bridges.get(canvas); }
export function hasRootRenderableContent(canvas: HTMLCanvasElement | undefined, hasPublicGeometry: boolean): boolean { return hasPublicGeometry || Boolean(canvas && bridges.has(canvas)); }
export function includeRootSourceMetadata<T extends { meshCount: number; primitiveCount: number; materialCount: number }>(metadata: T, attachedItems: readonly RenderItem[]): T {
  const renderable = attachedItems.filter(item => item.geometry && item.material);
  if (!renderable.length) return metadata;
  return {
    ...metadata,
    ...("assetId" in metadata && metadata.primitiveCount === 0 ? { assetId: "production-runtime-attached-source", assetUri: "aura3d://production-runtime/attached-source" } : {}),
    meshCount: metadata.meshCount + new Set(renderable.map(item => item.geometry)).size,
    primitiveCount: metadata.primitiveCount + renderable.length,
    materialCount: metadata.materialCount + new Set(renderable.map(item => item.material)).size
  };
}
