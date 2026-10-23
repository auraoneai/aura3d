/**
 * SH-04 / L1-12 — public WebGPU compute surface. Structural GPU types: the
 * compute context only needs this slice of `GPUDevice`, so it can be driven by
 * a real device or by a fake in unit tests.
 */

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
  readonly queue: {
    submit(commands: unknown[]): void;
    writeBuffer(buffer: unknown, offset: number, data: ArrayBufferView | ArrayBuffer): void;
    onSubmittedWorkDone?(): Promise<void>;
  };
  createShaderModule(descriptor: { label?: string; code: string }): unknown;
  createComputePipeline(descriptor: object): { getBindGroupLayout(index: number): unknown };
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

export type ComputeBindingType = "storage" | "read-only-storage" | "uniform";

export interface ComputeBindingSpec {
  /** `@group(0) @binding(n)` index declared in the WGSL. */
  readonly binding: number;
  readonly type: ComputeBindingType;
}

export type ComputeWorkgroupSize = readonly [number, number?, number?];

export interface ComputePipelineSpec {
  /** WGSL source. Required: compute has no GLSL path. */
  readonly wgsl: string;
  /** Name of the `@compute` entry point (default `"main"`). */
  readonly entryPoint?: string;
  /** Group-0 bindings the shader reads. Every one must be supplied at dispatch. */
  readonly bindings?: readonly ComputeBindingSpec[];
  /** Must equal the shader's `@workgroup_size(...)`; used to turn `items` into workgroup counts. Defaults to `[64]`. */
  readonly workgroupSize?: ComputeWorkgroupSize;
  readonly label?: string;
}

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

export interface ComputeDispatchInput {
  readonly pipeline: unknown;
  /** Buffers by binding index, or `{ binding, buffer }` pairs. */
  readonly bindings: Readonly<Record<number, unknown>> | readonly { readonly binding: number; readonly buffer: unknown }[];
  /** Explicit workgroup counts. Give this or `items`. */
  readonly workgroups?: ComputeWorkgroups;
  /** Invocation counts per axis; converted with `ceil(items / workgroupSize)`. */
  readonly items?: readonly [number, number?, number?];
}

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
