import type { RenderDevice, RenderTarget } from "./RenderDevice";
import { createSsrPassDescriptor, type SsrPassDescriptor } from "./PlanarReflection";
import { invertSsrProjection } from "./ProjectionMath";
export { invertSsrProjection } from "./ProjectionMath";

export interface ReflectionSurfaceSsrInputs {
  /** Color and nonlinear WebGL depth from the same completed scene frame. */
  readonly scene: RenderTarget;
  /** View-space normals encoded to RGB [0,1]; A is roughness, zero excludes the surface. */
  readonly normalMask: RenderTarget;
  readonly projection: Float32Array;
  readonly frame: number;
}
export interface ReflectionSurfaceSsrResult {
  readonly target: RenderTarget;
  readonly frame: number;
  readonly revision: number;
  readonly nativeDraws: number;
  readonly pixelBacked: true;
}
interface SsrNativeDevice extends RenderDevice {
  executeReflectionSurfaceSsr?(source: RenderTarget, normalMask: RenderTarget, output: RenderTarget,
    options: { projection: Float32Array; inverseProjection: Float32Array; maxSteps: number; maxDistance: number; thickness: number; intensity: number }): void;
}

/** Owns only output; borrows current scene/G-buffer targets from the existing renderer. */
export class ScreenSpaceReflectionPass {
  private output: RenderTarget | undefined;
  private disposed = false;
  private revision = 0;
  private lastFrame = -1;
  private latest: ReflectionSurfaceSsrResult | undefined;
  readonly descriptor: SsrPassDescriptor;

  constructor(private readonly device: SsrNativeDevice, options: Parameters<typeof createSsrPassDescriptor>[0]) {
    this.descriptor = createSsrPassDescriptor(options);
  }

  execute(inputs: ReflectionSurfaceSsrInputs, intensity = 0.8): ReflectionSurfaceSsrResult {
    this.latest = undefined;
    if (this.disposed) throw new Error("SSR pass is disposed.");
    if (!this.device.executeReflectionSurfaceSsr) throw new Error("SSR requires native renderer execution; CPU/mock fallback is unavailable.");
    const { scene, normalMask, frame, projection } = inputs;
    if (!scene || !normalMask || scene.disposed || normalMask.disposed || !scene.depthTexture || scene.depthTexture.disposed)
      throw new Error("SSR requires live scene color, sampleable depth, and normal-mask targets.");
    if (scene.width !== normalMask.width || scene.height !== normalMask.height)
      throw new Error("SSR input dimensions must match.");
    if (!Number.isSafeInteger(frame) || frame <= this.lastFrame) throw new Error("SSR requires a new completed frame.");
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 2) throw new RangeError("SSR intensity must be in [0, 2].");
    const inverseProjection = invertSsrProjection(projection);
    const width = Math.max(1, Math.ceil(scene.width * this.descriptor.resolutionScale));
    const height = Math.max(1, Math.ceil(scene.height * this.descriptor.resolutionScale));
    if (!this.output || this.output.width !== width || this.output.height !== height) {
      this.output?.dispose();
      this.output = undefined;
      this.output = this.device.createRenderTarget({ width, height, format: scene.colorTexture.format === "rgba16f" ? "rgba16f" : "rgba8", depth: false, label: "reflection-surface-ssr" });
    }
    this.device.executeReflectionSurfaceSsr(scene, normalMask, this.output, {
      projection, inverseProjection, intensity, maxSteps: this.descriptor.maxSteps,
      maxDistance: this.descriptor.maxDistance, thickness: this.descriptor.thickness,
    });
    this.lastFrame = frame;
    this.latest = Object.freeze({ target: this.output, frame, revision: ++this.revision, nativeDraws: 1, pixelBacked: true });
    return this.latest;
  }

  get result(): ReflectionSurfaceSsrResult | undefined {
    return this.latest?.target.disposed ? undefined : this.latest;
  }

  dispose(): void {
    this.disposed = true;
    this.latest = undefined;
    this.output?.dispose();
    this.output = undefined;
  }
}
