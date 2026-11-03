import { AuraNodeBuilder } from "./builder.js";
import type { AuraAssetRef, AuraRuntimeNodeSpec, AuraTransformSpec } from "./types.js";

/** Formats understood by the Gaussian splat asset loader. */
export type AuraGaussianSplatFormat = "ply" | "splat" | "ksplat" | "spz" | "gltf" | "glb";
/** Color space for formats without their own color-space metadata. */
export type AuraGaussianSplatColorSpace = "srgb_rec709_display" | "lin_rec709_display";
export interface AuraGaussianSplatOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly visible?: boolean;
  /** Actual input color space when the format has no metadata; defaults to sRGB. Does not convert the input. */
  readonly defaultColorSpace?: AuraGaussianSplatColorSpace;
  /** Maximum total splat occurrences across the asset's selected clouds and instances. */
  readonly maxSplats?: number;
  /** Maximum aggregate GPU instance-buffer bytes for this node's distinct clouds. */
  readonly maxGpuBytes?: number;
  readonly maxRadiusPx?: number;
  readonly sigmaCutoff?: number;
  readonly opacityCutoff?: number;
  /**
   * Opt-in GPU back-to-front sort on WebGPU (default false). A frame uses a
   * GPU order once one is ready for its exact camera and model; other frames,
   * non-WebGPU devices, devices without compute and any GPU failure use the
   * CPU sort, reported by the cloud renderer's `gpuSortStatus`.
   */
  readonly gpuSort?: boolean;
}
export interface AuraGaussianSplatNode extends AuraTransformSpec {
  readonly kind: "gaussian-splat";
  readonly asset: AuraAssetRef<"gaussian-splat">;
  readonly name?: string;
  readonly visible: boolean;
  readonly runtime?: AuraRuntimeNodeSpec;
  readonly defaultColorSpace?: AuraGaussianSplatColorSpace;
  readonly maxSplats?: number;
  readonly maxGpuBytes?: number;
  readonly maxRadiusPx?: number;
  readonly sigmaCutoff?: number;
  readonly opacityCutoff?: number;
  readonly gpuSort?: boolean;
}
export interface AuraGaussianSplatBackendDiagnostic {
  readonly backend: "webgl2" | "webgpu" | "mock" | "unknown";
  readonly supported: boolean;
  readonly reason?: string;
}

/** Describes renderer shader availability; it does not establish root-app mounting or device health. The mock never produces pixels. */
export function gaussianSplatBackendDiagnostic(backend: string): AuraGaussianSplatBackendDiagnostic {
  if (backend === "webgl2" || backend === "webgpu") return { backend, supported: true };
  if (backend === "mock") return { backend, supported: false, reason: "Mock backend does not rasterize splats." };
  return { backend: "unknown", supported: false, reason: `Unsupported Gaussian splat backend: ${backend}` };
}

/** @internal Validate values also supplied by builder chains or imported snapshots. */
export function validateGaussianSplatTransformOptions(options: AuraTransformSpec): void {
  if (options.lookAt !== undefined && (options.lookAt.length !== 3 || !options.lookAt.every(Number.isFinite))) throw new RangeError("Gaussian splat lookAt target must be finite");
  if (options.renderOrder !== undefined && !Number.isFinite(options.renderOrder)) throw new RangeError("Gaussian splat renderOrder must be finite");
  if (options.frustumCulled !== undefined && typeof options.frustumCulled !== "boolean") throw new TypeError("Gaussian splat frustumCulled must be boolean");
  if (options.layers !== undefined && (!Number.isInteger(options.layers) || options.layers < -0x80000000 || options.layers > 0xffffffff)) throw new RangeError("Gaussian splat layers must be a 32-bit mask");
}

/** Build a typed asset-backed splat descriptor. Root rendering requires a compatible backend and target. */
export function gaussianSplat(asset: AuraAssetRef<"gaussian-splat">, options: AuraGaussianSplatOptions = {}): AuraNodeBuilder<AuraGaussianSplatNode> {
  if (!asset || asset.kind !== "aura-asset-ref" || asset.type !== "gaussian-splat") throw new TypeError("gaussianSplat requires a typed gaussian-splat asset");
  if (typeof asset.format !== "string" || !["ply", "splat", "ksplat", "spz", "gltf", "glb"].includes(asset.format.toLowerCase())) throw new RangeError(`unsupported Gaussian splat format: ${String(asset.format)}`);
  if (options.defaultColorSpace !== undefined && options.defaultColorSpace !== "srgb_rec709_display" && options.defaultColorSpace !== "lin_rec709_display") throw new RangeError("unsupported Gaussian splat color space");
  validateGaussianSplatTransformOptions(options);
  for (const [name, value] of [["maxSplats", options.maxSplats], ["maxGpuBytes", options.maxGpuBytes]] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new RangeError(`${name} must be a positive safe integer`);
  }
  if (options.maxRadiusPx !== undefined && (!Number.isFinite(options.maxRadiusPx) || options.maxRadiusPx <= 0)) throw new RangeError("maxRadiusPx must be positive");
  if (options.sigmaCutoff !== undefined && (!Number.isFinite(options.sigmaCutoff) || options.sigmaCutoff <= 0 || options.sigmaCutoff > 4)) throw new RangeError("sigmaCutoff must be in (0,4]");
  if (options.opacityCutoff !== undefined && (!Number.isFinite(options.opacityCutoff) || options.opacityCutoff < 0 || options.opacityCutoff >= 1)) throw new RangeError("opacityCutoff must be in [0,1)");
  if (options.gpuSort !== undefined && typeof options.gpuSort !== "boolean") throw new TypeError("gpuSort must be boolean");
  return new AuraNodeBuilder({ ...options, kind: "gaussian-splat", asset, visible: options.visible ?? true });
}
