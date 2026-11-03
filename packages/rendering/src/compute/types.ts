/**
 * SH-04 / L1-12 — public WebGPU compute surface. Structural GPU types: the
 * compute context only needs this slice of `GPUDevice`, so it can be driven by
 * a real device or by a fake in unit tests.
 */
import type { RenderBuffer } from "../RenderDevice.js";
import type { Texture } from "../Texture.js";
import type { ShaderGraphCompileResult } from "../program/ShaderGraphCompiler.js";

/** Same-device resource access supplied by the mounted native render device. */
export interface ComputeRenderOwner {
  readonly nativeGpuDevice: unknown;
  readonly generation: number;
  readonly disposed: boolean;
  readonly contextLost: boolean;
  readonly resourceInterop: {
    /** The renderer's queue and device generation must match the compute device. */
    readonly queue: unknown;
    readonly generation: number;
    readonly disposed: boolean;
    register<T extends object>(resource: T, destroy: () => void): T;
    assertUsable(resource: object): void;
    submit(commands: readonly unknown[], accesses?: readonly { readonly resource: object; readonly mode: "read" | "write" | "readwrite" }[]): number;
    retire(resource: object): Promise<void>;
  };
  /** Create a renderer-owned allocation so graph draws can borrow the same buffer. */
  createBuffer(usage: "storage", byteLength: number): RenderBuffer;
  getNativeStorageBuffer(buffer: RenderBuffer): { readonly size: number; readonly usage: number; destroy(): void };
  /** Legacy owners must make pending writes/clears visible before returning a texture. */
  getNativeTexture(texture: Texture): ComputeNativeTexture;
  /** Prepare a texture for ordered compute access, including pending target clears. */
  getNativeComputeTexture?(texture: Texture, access: "read" | "write" | "readwrite", view?: { readonly baseMipLevel: number; readonly mipLevelCount: number }): ComputeNativeTexture;
  /** Optional owner-loss notification, independent of `GPUDevice.lost`. */
  onDeviceLost?(listener: () => void): () => void;
}

export interface ComputeNativeTexture {
  readonly sampleCount?: number;
  readonly mipLevelCount?: number;
  readonly format?: string;
  readonly usage?: number;
  createView(descriptor?: { readonly dimension?: string; readonly baseMipLevel?: number; readonly mipLevelCount?: number; readonly aspect?: "all" | "depth-only" | "stencil-only" }): unknown;
}

export interface ComputeGPUBufferLike {
  readonly size?: number;
  destroy(): void;
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
}

export interface ComputeGPUPassLike {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, group: unknown): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}

export interface ComputeGPUEncoderLike {
  beginComputePass(options?: object): ComputeGPUPassLike;
  copyBufferToBuffer(source: unknown, sourceOffset: number, destination: unknown, destinationOffset: number, size: number): void;
  finish(): unknown;
}

export interface ComputeGPUDeviceLike {
  readonly limits?: Readonly<Record<string, number>>;
  readonly features?: { has(feature: string): boolean };
  /** Native WebGPU resolves this when the device is lost or destroyed. */
  readonly lost?: Promise<unknown>;
  readonly queue: {
    submit(commands: unknown[]): void;
    writeBuffer(buffer: unknown, offset: number, data: ArrayBufferView | ArrayBuffer): void;
    onSubmittedWorkDone?(): Promise<void>;
  };
  createShaderModule(descriptor: { label?: string; code: string }): unknown;
  createComputePipeline(descriptor: object): { getBindGroupLayout(index: number): unknown };
  createComputePipelineAsync?(descriptor: object): Promise<{ getBindGroupLayout(index: number): unknown }>;
  createSampler?(descriptor?: ComputeSamplerSpec): unknown;
  createBuffer(descriptor: { label?: string; size: number; usage: number }): ComputeGPUBufferLike;
  createBindGroup(descriptor: object): unknown;
  createCommandEncoder(descriptor?: object): ComputeGPUEncoderLike;
}

/** `GPUBufferUsage` bit values (the global is absent outside browsers). */
export const COMPUTE_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  UNIFORM: 0x0040,
  STORAGE: 0x0080
} as const;

export const COMPUTE_MAP_MODE_READ = 1;

export type ComputeBindingType = "storage" | "read-only-storage" | "uniform" | "storage-texture" | "sampled-texture" | "sampler";

export interface ComputeSamplerSpec {
  readonly addressModeU?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly addressModeV?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly addressModeW?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly magFilter?: "nearest" | "linear";
  readonly minFilter?: "nearest" | "linear";
  readonly mipmapFilter?: "nearest" | "linear";
  readonly lodMinClamp?: number;
  readonly lodMaxClamp?: number;
  readonly maxAnisotropy?: number;
  readonly compare?: "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always";
}

export interface ComputeBindingSpec {
  /** `@binding(n)` index declared in the WGSL. */
  readonly binding: number;
  /** `@group(n)` index; defaults to 0. */
  readonly group?: number;
  readonly type: ComputeBindingType;
  /** Texture mip to bind. Storage views always contain one mip; sampled views default to the full chain. */
  readonly mipLevel?: number;
  /** Storage access declared in WGSL (default write). */
  readonly access?: "read" | "write" | "readwrite";
  /** Expected texture format in Aura or WebGPU spelling. */
  readonly format?: string;
  /** Expected texture view dimension. */
  readonly viewDimension?: "2d" | "2d-array" | "3d" | "cube";
  /** Expected sampled texture type; float requires WebGPU-filterable formats. */
  readonly sampleType?: "float" | "unfilterable-float" | "depth";
  /** Expected sampler class. */
  readonly samplerType?: "filtering" | "non-filtering" | "comparison";
  /** Minimum buffer size in bytes required by the shader. */
  readonly minBindingSize?: number;
}

export type ComputeWorkgroupSize = readonly [number, number?, number?];

interface ComputeWgslPipelineSpec {
  /** WGSL source. Required: compute has no GLSL path. */
  readonly wgsl: string;
  readonly graph?: never;
  /** Name of the `@compute` entry point (default `"main"`). */
  readonly entryPoint?: string;
  /** Bindings the shader reads. Every one must be supplied at dispatch. */
  readonly bindings?: readonly ComputeBindingSpec[];
  /** Must equal the shader's `@workgroup_size(...)`; used to turn `items` into workgroup counts. Defaults to `[64]`. */
  readonly workgroupSize?: ComputeWorkgroupSize;
  readonly label?: string;
}

/** Compile a graph separately and pass its WGSL result directly to compute. */
interface ComputeGraphPipelineSpec {
  readonly graph: ShaderGraphCompileResult;
  readonly wgsl?: never;
  readonly entryPoint?: never;
  readonly bindings?: never;
  readonly workgroupSize?: never;
  readonly label?: string;
}

export type ComputePipelineSpec = ComputeWgslPipelineSpec | ComputeGraphPipelineSpec;

export type ComputeBufferUsage = "storage" | "uniform";

export interface ComputeBufferSpec {
  /** Byte size (rounded up to a multiple of 4). Required unless `data` is given. */
  readonly size?: number;
  /** Initial contents, uploaded at creation. */
  readonly data?: ArrayBufferView | ArrayBuffer;
  /** Default `"storage"`. */
  readonly usage?: ComputeBufferUsage;
  readonly label?: string;
}

export type ComputeWorkgroups = readonly [number, number?, number?];

type ComputeDispatchResource =
  | { readonly group?: number; readonly binding: number; readonly buffer: unknown }
  | { readonly group?: number; readonly binding: number; readonly texture: unknown }
  | { readonly group?: number; readonly binding: number; readonly sampler: unknown };

interface ComputeDispatchOptions {
  readonly pipeline: unknown;
  /** Explicit workgroup counts. Give this or `items`. */
  readonly workgroups?: ComputeWorkgroups;
  /** Invocation counts per axis; converted with `ceil(items / workgroupSize)`. */
  readonly items?: readonly [number, number?, number?];
}

export type ComputeDispatchInput = ComputeDispatchOptions & (
  /** Numeric maps address group 0; arrays can address arbitrary groups explicitly. */
  | { readonly bindings: Readonly<Record<number, unknown>> | readonly ComputeDispatchResource[]; readonly graphBindings?: never }
  /** Graph resources by name. Color textures use `{ texture, sampler }`; other resources are supplied directly. */
  | { readonly graphBindings: Readonly<Record<string, unknown>>; readonly bindings?: never }
);

export interface ComputeDispatchResult {
  readonly workgroups: readonly [number, number, number];
  /** Total invocations: workgroups x workgroup size. */
  readonly invocations: number;
}

export type ComputeErrorCode =
  | "compute-invalid-spec"
  | "compute-wgsl-required"
  | "compute-disposed"
  | "compute-read-failed";

export class ComputeError extends Error {
  readonly code: ComputeErrorCode;

  constructor(code: ComputeErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message);
    this.name = "ComputeError";
    this.code = code;
    if (options && "cause" in options) this.cause = options.cause;
  }
}
