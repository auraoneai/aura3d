import type { GPUParticleBackendCapabilities } from "./GPUParticleBackend.js";

export interface ParticleBatchDiagnosticsInput {
  readonly name: string;
  readonly particleCount: number;
  readonly drawCalls?: number;
  readonly staticBytesPerParticle?: number;
  readonly dynamicBytesPerParticle?: number;
}

export interface ParticleBatchDiagnosticsOptions {
  readonly updateMode: "static-geometry" | "cpu-dynamic" | "gpu-compute";
  readonly backend?: GPUParticleBackendCapabilities;
  readonly targetFrameMs?: number;
}

export interface ParticleBatchDiagnostics {
  readonly batches: readonly ParticleBatchDiagnosticsInput[];
  readonly totalParticles: number;
  readonly totalDrawCalls: number;
  readonly staticGeometryBytes: number;
  readonly dynamicUploadBytes: number;
  readonly updateMode: ParticleBatchDiagnosticsOptions["updateMode"];
  readonly gpuBackend: GPUParticleBackendCapabilities;
  readonly warnings: readonly string[];
}

export interface ParticleLayerBudgetInput {
  readonly name: string;
  readonly weight: number;
}

export interface ParticleDensityTier<TMode extends string = string> {
  readonly threshold: number;
  readonly label: string;
  readonly mode: TMode;
}

export interface LayeredParticleBudgetOptions<TMode extends string = string> {
  readonly requestedParticles: number;
  readonly defaultParticles?: number;
  readonly minParticles: number;
  readonly maxParticles: number;
  readonly layers: readonly ParticleLayerBudgetInput[];
  readonly densityTiers: readonly ParticleDensityTier<TMode>[];
  readonly nativeGpuComputeDispatches?: number;
}

export interface ParticleLayerBudget {
  readonly name: string;
  readonly weight: number;
  readonly particleCount: number;
}

export interface LayeredParticleBudgetPlan<TMode extends string = string> {
  readonly requestedParticles: number;
  readonly effectiveParticles: number;
  readonly densityTier: string;
  readonly mode: TMode;
  readonly layers: readonly ParticleLayerBudget[];
  readonly nativeGpuComputeDispatches: number;
}

const POSITION_ONLY_BYTES = 3 * Float32Array.BYTES_PER_ELEMENT;
const SPRITE_UPLOAD_BYTES = (3 + 4 + 1 + 1) * Float32Array.BYTES_PER_ELEMENT;

export function createParticleBatchDiagnostics(
  batches: readonly ParticleBatchDiagnosticsInput[],
  options: ParticleBatchDiagnosticsOptions
): ParticleBatchDiagnostics {
  let totalParticles = 0;
  let totalDrawCalls = 0;
  let staticGeometryBytes = 0;
  let dynamicUploadBytes = 0;

  for (const batch of batches) {
    validateParticleBatch(batch);
    totalParticles += batch.particleCount;
    totalDrawCalls += batch.drawCalls ?? 1;
    staticGeometryBytes += batch.particleCount * (batch.staticBytesPerParticle ?? POSITION_ONLY_BYTES);
    dynamicUploadBytes += batch.particleCount * (batch.dynamicBytesPerParticle ?? SPRITE_UPLOAD_BYTES);
  }

  const gpuBackend = options.backend ?? {
    supported: false,
    backend: "none",
    reason: "No GPU particle backend capability report was supplied."
  };
  const warnings = createParticleWarnings(totalParticles, dynamicUploadBytes, options, gpuBackend);

  return {
    batches,
    totalParticles,
    totalDrawCalls,
    staticGeometryBytes,
    dynamicUploadBytes,
    updateMode: options.updateMode,
    gpuBackend,
    warnings
  };
}

export function summarizeParticleBatchDiagnostics(diagnostics: ParticleBatchDiagnostics): readonly string[] {
  const gpu = diagnostics.gpuBackend.supported
    ? `${diagnostics.gpuBackend.backend}${diagnostics.gpuBackend.adapterName ? `:${diagnostics.gpuBackend.adapterName}` : ""}`
    : `${diagnostics.gpuBackend.backend}:unsupported`;
  return [
    `${diagnostics.totalParticles.toLocaleString("en-US")} particles across ${diagnostics.batches.length} G3D point batches`,
    `${diagnostics.totalDrawCalls} particle draw batches, ${formatBytes(diagnostics.staticGeometryBytes)} static point data`,
    `${formatBytes(diagnostics.dynamicUploadBytes)} estimated CPU sprite upload if updated as dynamic particles`,
    `particle update path: ${diagnostics.updateMode}; GPU backend: ${gpu}`,
    ...diagnostics.warnings
  ];
}

export function createLayeredParticleBudgetPlan<TMode extends string>(
  options: LayeredParticleBudgetOptions<TMode>
): LayeredParticleBudgetPlan<TMode> {
  validateLayeredBudgetOptions(options);
  const requestedParticles = Number.isFinite(options.requestedParticles)
    ? Math.round(options.requestedParticles)
    : Math.round(options.defaultParticles ?? options.minParticles);
  const effectiveParticles = Math.min(options.maxParticles, Math.max(options.minParticles, requestedParticles));
  const layers: ParticleLayerBudget[] = [];
  let assigned = 0;
  for (let index = 0; index < options.layers.length; index += 1) {
    const layer = options.layers[index]!;
    const isLast = index === options.layers.length - 1;
    const particleCount = isLast
      ? Math.max(0, effectiveParticles - assigned)
      : Math.ceil(effectiveParticles * layer.weight);
    assigned += particleCount;
    layers.push({
      name: layer.name,
      weight: layer.weight,
      particleCount
    });
  }
  const densityTier = [...options.densityTiers]
    .sort((a, b) => b.threshold - a.threshold)
    .find((tier) => effectiveParticles >= tier.threshold) ?? options.densityTiers[options.densityTiers.length - 1]!;

  return {
    requestedParticles,
    effectiveParticles,
    densityTier: densityTier.label,
    mode: densityTier.mode,
    layers,
    nativeGpuComputeDispatches: Math.max(0, Math.round(options.nativeGpuComputeDispatches ?? 0))
  };
}

function validateParticleBatch(batch: ParticleBatchDiagnosticsInput): void {
  if (!Number.isInteger(batch.particleCount) || batch.particleCount < 0) {
    throw new RangeError("Particle batch particleCount must be a non-negative integer.");
  }
  if (batch.drawCalls !== undefined && (!Number.isInteger(batch.drawCalls) || batch.drawCalls < 0)) {
    throw new RangeError("Particle batch drawCalls must be a non-negative integer.");
  }
  if (batch.staticBytesPerParticle !== undefined && (!Number.isFinite(batch.staticBytesPerParticle) || batch.staticBytesPerParticle < 0)) {
    throw new RangeError("Particle batch staticBytesPerParticle must be finite and non-negative.");
  }
  if (batch.dynamicBytesPerParticle !== undefined && (!Number.isFinite(batch.dynamicBytesPerParticle) || batch.dynamicBytesPerParticle < 0)) {
    throw new RangeError("Particle batch dynamicBytesPerParticle must be finite and non-negative.");
  }
}

function validateLayeredBudgetOptions<TMode extends string>(options: LayeredParticleBudgetOptions<TMode>): void {
  if (!Number.isFinite(options.minParticles) || !Number.isInteger(options.minParticles) || options.minParticles < 0) {
    throw new RangeError("Layered particle budget minParticles must be a non-negative integer.");
  }
  if (options.defaultParticles !== undefined && (!Number.isFinite(options.defaultParticles) || !Number.isInteger(options.defaultParticles))) {
    throw new RangeError("Layered particle budget defaultParticles must be an integer when supplied.");
  }
  if (!Number.isFinite(options.maxParticles) || !Number.isInteger(options.maxParticles) || options.maxParticles < options.minParticles) {
    throw new RangeError("Layered particle budget maxParticles must be an integer greater than or equal to minParticles.");
  }
  if (options.layers.length === 0) {
    throw new RangeError("Layered particle budget requires at least one layer.");
  }
  for (const layer of options.layers) {
    if (!layer.name.trim()) throw new RangeError("Layered particle budget layer names must be non-empty.");
    if (!Number.isFinite(layer.weight) || layer.weight < 0 || layer.weight > 1) {
      throw new RangeError("Layered particle budget layer weights must be finite values from 0 to 1.");
    }
  }
  if (options.densityTiers.length === 0) {
    throw new RangeError("Layered particle budget requires at least one density tier.");
  }
  for (const tier of options.densityTiers) {
    if (!Number.isFinite(tier.threshold) || !Number.isInteger(tier.threshold) || tier.threshold < 0) {
      throw new RangeError("Layered particle budget density tier thresholds must be non-negative integers.");
    }
    if (!tier.label.trim()) throw new RangeError("Layered particle budget density tier labels must be non-empty.");
  }
}

function createParticleWarnings(
  totalParticles: number,
  dynamicUploadBytes: number,
  options: ParticleBatchDiagnosticsOptions,
  backend: GPUParticleBackendCapabilities
): readonly string[] {
  const warnings: string[] = [];
  if (options.updateMode !== "gpu-compute") {
    warnings.push("not a GPGPU simulation; positions are generated on CPU and animated by render-item transforms");
  }
  if (!backend.supported) {
    warnings.push(backend.reason ?? "GPU particle backend is unavailable in this runtime");
  }
  if (totalParticles >= 50000 && options.updateMode !== "gpu-compute") {
    warnings.push("50k CPU-generated particles is a dense visualization tier, not a native compute-particle stress proof");
  }
  if (options.targetFrameMs !== undefined && dynamicUploadBytes / Math.max(1, options.targetFrameMs) > 750_000) {
    warnings.push("dynamic CPU particle upload estimate is high for the target frame budget");
  }
  return warnings;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
