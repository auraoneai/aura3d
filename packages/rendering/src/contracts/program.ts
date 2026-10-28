/**
 * C-02 — ProgramFeatures, ShaderFeature/chunk registry, ProgramCache (CONTRACTS.md).
 * Provider: PRD 01. File: packages/rendering/src/contracts/program.ts.
 */

import type { RegistryEntry, ContractSlot, QrFlags, PrdId } from "./core";
import { StructuralMemo } from "./structuralMemo";
import type { RenderItem } from "./renderItem";
import type { AuraQualityTierSettings } from "./quality";
import type { UniformValue, RenderDevice, RenderShaderProgram } from "../RenderDevice";

export interface TextureSlotFeature { readonly uvSet: 0 | 1; readonly transform: boolean; }
export type ShadowReceiveFeature = { readonly cascades: 0 | 1 | 2 | 3 | 4; readonly pcfTaps: 1 | 4 | 9; readonly localShadows: number; readonly contact: boolean };
export interface ProgramFeatures {
  readonly pass: "forward" | "depth" | "distance" | "velocity";
  readonly target: "glsl300es" | "wgsl";
  readonly lighting: "lit" | "unlit";
  readonly maps: { readonly baseColor?: TextureSlotFeature; readonly normal?: TextureSlotFeature; readonly metallicRoughness?: TextureSlotFeature; readonly occlusion?: TextureSlotFeature; readonly emissive?: TextureSlotFeature };
  readonly extensions: readonly MaterialExtensionFeature[];        // C-03
  readonly alphaMode: "opaque" | "mask" | "blend";
  readonly doubleSided: boolean;
  readonly vertexColors: boolean;
  readonly flatShading: boolean;
  readonly skinning?: { readonly influences: 4 | 8; readonly palette: "uniform" | "texture" };
  readonly morph?: { readonly targetBucket: 4 | 8 | 16 | 32; readonly normals: boolean; readonly tangents: boolean };
  readonly instancing?: { readonly color: boolean; readonly emissive?: boolean };
  readonly drawId?: "multi-draw" | "uniform";                       // PRD 11
  readonly lights: { readonly dir: 0 | 1 | 2 | 4 | 8; readonly point: 0 | 1 | 2 | 4 | 8; readonly spot: 0 | 1 | 2 | 4 | 8; readonly rect: 0 | 1 | 2 | 4; readonly clustered: boolean; readonly hemisphere: boolean };
  readonly shadows: ShadowReceiveFeature;                           // C-11
  readonly environment: "none" | "pmrem-cube" | "equirect";          // C-09
  readonly fog: "none" | "linear" | "exp2" | "height" | "volumetric"; // C-21
  readonly diffuseModel: "lambert" | "burley";
  readonly specularAntialiasing: boolean;
  readonly backgroundCoverage: boolean;
  /** Open feature bits contributed by registered ShaderFeatures; key = ShaderFeature.id. */
  readonly features: Readonly<Record<string, string | number | boolean>>;
}
export interface MaterialExtensionFeature { readonly lobe: string; readonly maps: readonly string[]; readonly bits: Readonly<Record<string, string | number | boolean>>; }

/** Deterministic, order-independent program key: canonical JSON with sorted keys at every level. */
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(",")}}`;
}

/**
 * Program keys are asked for several times per draw per frame (warm-up, `acquire`, the draw's own lookup) with records that
 * are rebuilt each time but identical from frame to frame. Serialising one costs ~15 us; comparing it with a recent record
 * costs ~1 us. A small ring of recent (record snapshot, key) pairs turns the steady state into compares only.
 */
const keyMemo = new StructuralMemo<string>(24);

export function computeProgramKey(features: ProgramFeatures): string {
  return keyMemo.resolve(features, () => stableSerialize(features));
}

export interface ShaderChunk {
  readonly name: string;                     // global unique, "a3d_<owner>_<name>" for new chunks; legacy names allowed
  readonly owner: PrdId;
  readonly glsl: string;                     // GLSL ES 3.00 body; no #version; may declare uniforms/functions
  readonly wgsl?: string;                    // PRD 11 twin; absence => WGSL_PROGRAM_MISSING on webgpu backend
  readonly stage: "vertex" | "fragment" | "both";
  readonly requires?: readonly string[];     // other chunk names
}
export interface ShaderFeature extends RegistryEntry {
  readonly id: string;                       // e.g. "prd08.cameraFade", "prd05.lodDither", "prd10.wind"
  /** Return the feature bit value for this draw, or undefined when inactive. Must be pure. */
  select(input: ShaderFeatureSelectInput): string | number | boolean | undefined;
  defines(value: string | number | boolean): Readonly<Record<string, string | number | true>>;
  readonly chunks: readonly string[];        // inserted at hook points
  readonly hooks: readonly ShaderHookPoint[];
  bindUniforms?(value: string | number | boolean, item: RenderItem, set: (name: string, v: UniformValue) => void): void;
}
export type ShaderHookPoint =
  | "vertex:pars" | "vertex:deform" | "vertex:world" | "vertex:end"
  | "fragment:pars" | "fragment:alpha" | "fragment:normal" | "fragment:material"
  | "fragment:lights" | "fragment:indirect" | "fragment:emissive" | "fragment:fog" | "fragment:end";
export interface ShaderFeatureSelectInput { readonly item: RenderItem; readonly pass: ProgramFeatures["pass"]; readonly tier: AuraQualityTierSettings; readonly flags: QrFlags; }

import { createRegistry } from "./core";

const shaderChunks = new Map<string, ShaderChunk>();
const shaderFeatures = createRegistry<ShaderFeature>("shaderFeatures");

/** Registries are real in PR 0a: they store and validate; the generator stays pending until PRD 01. */
export function registerShaderChunk(chunk: ShaderChunk): void {
  if (shaderChunks.has(chunk.name)) {
    throw new Error(`SHADER_CHUNK_DUPLICATE:${chunk.name}`);
  }
  shaderChunks.set(chunk.name, chunk);
}

export function registerShaderFeature(feature: ShaderFeature): () => void {
  return shaderFeatures.register(feature);
}

export function shaderChunk(name: string): ShaderChunk | undefined {
  return shaderChunks.get(name);
}

/**
 * #198 (QR-11 Q-01-4): read-only enumeration of every registered chunk, in
 * registration order — for the WGSL-twin manifest parity report
 * (`program/chunks/manifest.ts`) and the C-02 "every registered chunk
 * compiles" check. Returns a snapshot; registering later does not mutate it.
 */
export function allShaderChunks(): readonly ShaderChunk[] {
  return [...shaderChunks.values()];
}

/** Registered features, ordered for hook splicing: (order ?? 0, id). */
export function shaderFeaturesFor(flags: QrFlags): readonly ShaderFeature[] {
  return shaderFeatures.active(flags);
}

export interface GeneratedProgram { readonly key: string; readonly vertex: string; readonly fragment: string; readonly defines: Readonly<Record<string, string | number | true>>; }
export type ProgramGeneratorImpl = (features: ProgramFeatures) => GeneratedProgram;
let programGeneratorImpl: ProgramGeneratorImpl | undefined;
/** PRD 01's program/ProgramGenerator.ts installs the real C-02 generator (lane 01). */
export function installProgramGenerator(impl: ProgramGeneratorImpl): void {
  programGeneratorImpl = impl;
}
export function generateProgram(features: ProgramFeatures): GeneratedProgram {
  if (programGeneratorImpl === undefined) {
    throw new Error(`PROGRAM_GENERATOR_PENDING:${computeProgramKey(features)}`);
  }
  return programGeneratorImpl(features);
}

export interface ProgramHandle { readonly key: string; readonly status: "pending" | "ready" | "failed"; readonly program?: RenderShaderProgram; readonly error?: string; }
export interface ProgramCacheLike {
  acquire(features: ProgramFeatures): ProgramHandle;
  precompile(list: readonly ProgramFeatures[]): Promise<void>;
  stats(): { readonly compiled: number; readonly pending: number; readonly failed: number; readonly compileMsTotal: number; readonly compiledSinceReady?: number };
  /** T0-06: resets the per-frame sync-compile bound; called once per render. */
  beginFrame?(): void;
  /** T0-06: marks the ready barrier; compiles after it count `compiledSinceReady`. */
  markReady?(): void;
  dispose(): void;
}
import { defineContractSlot } from "./core";
import { createLeanCoreShaderLibrary, DEFAULT_UNLIT_SHADER_NAME, DEFAULT_DEPTH_SHADER_NAME, type ShaderLibrary } from "../ShaderLibraryCore";
import { DEFAULT_PBR_SHADER_NAME } from "../PBRMaterial";

/**
 * PR 0a stub: wraps the existing ShaderLibrary lookups and ignores registered
 * features. Depth/distance passes map to the lean depth shader, unlit to the
 * lean unlit shader, everything else to the default PBR program.
 */
function shaderNameFor(features: ProgramFeatures): string {
  if (features.pass === "depth" || features.pass === "distance") return DEFAULT_DEPTH_SHADER_NAME;
  if (features.lighting === "unlit") return DEFAULT_UNLIT_SHADER_NAME;
  return DEFAULT_PBR_SHADER_NAME;
}

class StubProgramCache implements ProgramCacheLike {
  private library: ShaderLibrary | null = null;
  /** 01-HANG: one program per key — the stub used to compile on every acquire (per draw, per frame). */
  private readonly entries = new Map<string, ProgramHandle>();
  private compiled = 0;
  private failed = 0;
  private compileMsTotal = 0;
  constructor(private readonly device: RenderDevice) {}

  private getLibrary(): ShaderLibrary {
    if (!this.library) this.library = createLeanCoreShaderLibrary();
    return this.library;
  }

  acquire(features: ProgramFeatures): ProgramHandle {
    const key = computeProgramKey(features);
    const cached = this.entries.get(key);
    if (cached) return cached;
    let handle: ProgramHandle;
    try {
      const started = Date.now();
      const program = this.device.createShaderProgram(this.getLibrary().compileSource(shaderNameFor(features)));
      this.compiled += 1;
      this.compileMsTotal += Date.now() - started;
      handle = { key, status: "ready", program };
    } catch (error) {
      this.failed += 1;
      handle = { key, status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    this.entries.set(key, handle);
    return handle;
  }

  async precompile(list: readonly ProgramFeatures[]): Promise<void> {
    for (const features of list) {
      this.acquire(features);
    }
  }

  stats() {
    return { compiled: this.compiled, pending: 0, failed: this.failed, compileMsTotal: this.compileMsTotal };
  }

  dispose(): void {
    for (const handle of this.entries.values()) handle.program?.dispose?.();
    this.entries.clear();
    this.library = null;
  }
}

/** Optional C-36 sink for generator/cache degradations (`extension-lobe-pending`, `program-compile-failed`). */
export interface ProgramDegradationLike { readonly code: string; readonly message: string; readonly ownerPrd?: number; }
/**
 * C-02 cache options. `flags` makes the real generator resolve registered
 * ShaderFeatures and C-03 lobes (without it no feature chunk is ever spliced —
 * T0-05); `onDegradation` receives C-36 entries.
 */
export interface ProgramCacheSlotOptions {
  readonly parallelCompile?: boolean;
  readonly flags?: QrFlags;
  readonly onDegradation?: (degradation: ProgramDegradationLike) => void;
}
export const programCacheSlot: ContractSlot<(device: RenderDevice, o?: ProgramCacheSlotOptions) => ProgramCacheLike> =
  defineContractSlot("C-02", "prd01", "A3D_QR_CORE", (device) => new StubProgramCache(device));
