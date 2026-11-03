export type NativeRenderBundleKey = string | number | symbol | object;

export interface NativeRenderBundleDescriptor {
  readonly colorFormats: readonly (string | null)[];
  readonly depthStencilFormat?: string;
  readonly sampleCount?: number;
  readonly depthReadOnly?: boolean;
  readonly stencilReadOnly?: boolean;
}

export type NativeRenderBundleCommand =
  | { readonly kind: "set-pipeline"; readonly pipeline: object }
  | { readonly kind: "set-bind-group"; readonly slot: number; readonly group: object | null; readonly dynamicOffsets?: readonly number[] | Uint32Array }
  | { readonly kind: "set-vertex-buffer"; readonly slot: number; readonly buffer: object | null; readonly offset?: number; readonly size?: number }
  | { readonly kind: "set-index-buffer"; readonly buffer: object; readonly format: "uint16" | "uint32"; readonly offset?: number; readonly size?: number }
  | { readonly kind: "draw"; readonly vertexCount: number; readonly instanceCount?: number; readonly firstVertex?: number; readonly firstInstance?: number }
  | { readonly kind: "draw-indexed"; readonly indexCount: number; readonly instanceCount?: number; readonly firstIndex?: number; readonly baseVertex?: number; readonly firstInstance?: number }
  | { readonly kind: "draw-indirect" | "draw-indexed-indirect"; readonly buffer: object; readonly offset: number }
  | { readonly kind: "set-viewport"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly minDepth?: number; readonly maxDepth?: number }
  | { readonly kind: "set-scissor-rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly kind: "set-blend-constant"; readonly color: readonly [number, number, number, number] }
  | { readonly kind: "set-stencil-reference"; readonly reference: number };

export interface NativeRenderBundleRequest {
  readonly key: NativeRenderBundleKey;
  readonly pass: object;
  readonly passDevice: object;
  readonly descriptor: NativeRenderBundleDescriptor;
  readonly commands: readonly NativeRenderBundleCommand[];
  readonly cacheable?: boolean;
  readonly lifetime?: {
    readonly revision: object;
    readonly isValid: () => boolean;
  };
}

export interface NativeRenderBundleResult {
  readonly mode: "direct" | "bundle";
  readonly reason: "disabled" | "untracked-resources" | "dynamic-state" | "incomplete-state" | "unsupported" | "oversized" | "validation-pending" | "validation-failed" | "capture-failed" | "reused";
  readonly requiresStateRebind: true;
}

export interface NativeRenderBundleOwner {
  readonly nativeGpuDevice?: object;
  readonly generation?: number;
  readonly disposed: boolean;
  readonly contextLost: boolean;
  onDeviceLost?(listener: () => void): () => void;
}

type SignaturePart = string | number | boolean | object | null | undefined;

interface CommandTarget {
  setPipeline(pipeline: object): void;
  setBindGroup(slot: number, group: object | null, offsets?: readonly number[]): void;
  setVertexBuffer(slot: number, buffer: object | null, offset?: number, size?: number): void;
  setIndexBuffer(buffer: object, format: "uint16" | "uint32", offset?: number, size?: number): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
  drawIndirect(buffer: object, offset: number): void;
  drawIndexedIndirect(buffer: object, offset: number): void;
  setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): void;
  setScissorRect(x: number, y: number, width: number, height: number): void;
  setBlendConstant(color: readonly [number, number, number, number]): void;
  setStencilReference(reference: number): void;
}

interface BundleEncoder extends CommandTarget {
  finish(): object;
}

interface BundleDevice {
  createRenderBundleEncoder(descriptor: NativeRenderBundleDescriptor): BundleEncoder;
  pushErrorScope(filter: "validation"): void;
  popErrorScope(): Promise<unknown | null>;
}

interface BundlePass extends CommandTarget {
  executeBundles(bundles: readonly object[]): void;
}

interface PreparedCommands {
  readonly descriptor: NativeRenderBundleDescriptor;
  readonly commands: readonly NativeRenderBundleCommand[];
  readonly signature: readonly SignaturePart[];
  readonly dynamic: boolean;
  readonly incomplete: boolean;
}

interface CacheEntry {
  readonly signature: readonly SignaturePart[];
  readonly cost: number;
  state: "pending" | "ready" | "validation-failed" | "capture-failed";
  bundle?: object;
}

const MAX_CACHE_ENTRIES = 64;
const MAX_CACHED_COST = 262144;
const MAX_OFFSETS_PER_GROUP = 64;
const MAX_U32 = 0xffffffff;

function requireObject(value: unknown, name: string): asserts value is object {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new Error(`WEBGPU_BUNDLE_INVALID_ARGUMENT: ${name} must be an object`);
  }
}

function uint(value: number, name: string, max = MAX_U32): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`WEBGPU_BUNDLE_INVALID_ARGUMENT: ${name} must be a non-negative integer`);
  }
  return value;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`WEBGPU_BUNDLE_INVALID_ARGUMENT: ${name} must be finite`);
  return value;
}

function optionalSize(value: number | undefined, name: string): number | undefined {
  return value === undefined ? undefined : uint(value, name, Number.MAX_SAFE_INTEGER);
}

function prepare(request: NativeRenderBundleRequest): PreparedCommands {
  const input = request.descriptor;
  if (!input || !Array.isArray(input.colorFormats) || input.colorFormats.length > 32) {
    throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: colorFormats must be a bounded array");
  }
  const colorFormats = Array.from(input.colorFormats, (format) => {
    if (format !== null && (typeof format !== "string" || format.length === 0)) {
      throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: invalid color attachment format");
    }
    return format;
  });
  if (input.depthStencilFormat !== undefined && (typeof input.depthStencilFormat !== "string" || !input.depthStencilFormat)) {
    throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: invalid depth attachment format");
  }
  if (!colorFormats.some((format) => format !== null) && !input.depthStencilFormat) {
    throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: at least one attachment format is required");
  }
  if ((input.depthReadOnly !== undefined && typeof input.depthReadOnly !== "boolean") ||
      (input.stencilReadOnly !== undefined && typeof input.stencilReadOnly !== "boolean")) {
    throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: read-only flags must be boolean");
  }
  const sampleCount = uint(input.sampleCount ?? 1, "sampleCount");
  if (sampleCount === 0) throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: sampleCount must be positive");
  const descriptor: NativeRenderBundleDescriptor = {
    colorFormats,
    ...(input.depthStencilFormat !== undefined ? { depthStencilFormat: input.depthStencilFormat } : {}),
    ...(input.sampleCount !== undefined ? { sampleCount } : {}),
    ...(input.depthReadOnly !== undefined ? { depthReadOnly: input.depthReadOnly } : {}),
    ...(input.stencilReadOnly !== undefined ? { stencilReadOnly: input.stencilReadOnly } : {})
  };
  if (!Array.isArray(request.commands)) throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: commands must be an array");
  const signature: SignaturePart[] = [
    colorFormats.length, ...colorFormats, input.depthStencilFormat, sampleCount,
    input.depthReadOnly ?? false, input.stencilReadOnly ?? false, request.lifetime?.revision,
    request.commands.length
  ];
  const commands: NativeRenderBundleCommand[] = [];
  let dynamic = false;
  let hasPipeline = false;
  let hasIndexBuffer = false;
  let incomplete = false;
  for (const command of request.commands) {
    if (!command || typeof command !== "object") throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: invalid command");
    signature.push(command.kind);
    switch (command.kind) {
      case "set-pipeline":
        requireObject(command.pipeline, "pipeline");
        hasPipeline = true;
        signature.push(command.pipeline);
        commands.push({ kind: command.kind, pipeline: command.pipeline });
        break;
      case "set-bind-group": {
        const slot = uint(command.slot, "bind group slot");
        if (command.group !== null) requireObject(command.group, "bind group");
        const source = command.dynamicOffsets ?? [];
        if ((!Array.isArray(source) && !(source instanceof Uint32Array)) || source.length > MAX_OFFSETS_PER_GROUP) {
          throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: invalid dynamic offsets");
        }
        const dynamicOffsets = Array.from(source, (offset) => uint(offset, "dynamic offset"));
        if (command.group === null && dynamicOffsets.length) throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: null bind group has dynamic offsets");
        signature.push(slot, command.group, dynamicOffsets.length, ...dynamicOffsets);
        commands.push({ kind: command.kind, slot, group: command.group, dynamicOffsets });
        break;
      }
      case "set-vertex-buffer": {
        const slot = uint(command.slot, "vertex buffer slot");
        if (command.buffer !== null) requireObject(command.buffer, "vertex buffer");
        const offset = uint(command.offset ?? 0, "vertex buffer offset", Number.MAX_SAFE_INTEGER);
        const size = optionalSize(command.size, "vertex buffer size");
        if (command.buffer === null && (offset !== 0 || size !== undefined)) throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: null vertex buffer has a range");
        signature.push(slot, command.buffer, offset, size);
        commands.push({ kind: command.kind, slot, buffer: command.buffer, offset, ...(size !== undefined ? { size } : {}) });
        break;
      }
      case "set-index-buffer": {
        requireObject(command.buffer, "index buffer");
        if (command.format !== "uint16" && command.format !== "uint32") throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: invalid index format");
        const offset = uint(command.offset ?? 0, "index buffer offset", Number.MAX_SAFE_INTEGER);
        const size = optionalSize(command.size, "index buffer size");
        hasIndexBuffer = true;
        signature.push(command.buffer, command.format, offset, size);
        commands.push({ kind: command.kind, buffer: command.buffer, format: command.format, offset, ...(size !== undefined ? { size } : {}) });
        break;
      }
      case "draw": {
        const vertexCount = uint(command.vertexCount, "vertexCount");
        const instanceCount = uint(command.instanceCount ?? 1, "instanceCount");
        const firstVertex = uint(command.firstVertex ?? 0, "firstVertex");
        const firstInstance = uint(command.firstInstance ?? 0, "firstInstance");
        incomplete ||= !hasPipeline;
        signature.push(vertexCount, instanceCount, firstVertex, firstInstance);
        commands.push({ kind: command.kind, vertexCount, instanceCount, firstVertex, firstInstance });
        break;
      }
      case "draw-indexed": {
        const indexCount = uint(command.indexCount, "indexCount");
        const instanceCount = uint(command.instanceCount ?? 1, "instanceCount");
        const firstIndex = uint(command.firstIndex ?? 0, "firstIndex");
        const baseVertex = command.baseVertex ?? 0;
        if (!Number.isInteger(baseVertex) || baseVertex < -0x80000000 || baseVertex > 0x7fffffff) {
          throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: baseVertex must be a signed 32-bit integer");
        }
        const firstInstance = uint(command.firstInstance ?? 0, "firstInstance");
        incomplete ||= !hasPipeline || !hasIndexBuffer;
        signature.push(indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
        commands.push({ kind: command.kind, indexCount, instanceCount, firstIndex, baseVertex, firstInstance });
        break;
      }
      case "draw-indirect":
      case "draw-indexed-indirect": {
        requireObject(command.buffer, "indirect buffer");
        const offset = uint(command.offset, "indirect offset", Number.MAX_SAFE_INTEGER);
        incomplete ||= !hasPipeline || (command.kind === "draw-indexed-indirect" && !hasIndexBuffer);
        signature.push(command.buffer, offset);
        commands.push({ kind: command.kind, buffer: command.buffer, offset });
        break;
      }
      case "set-viewport": {
        const x = finite(command.x, "viewport x"), y = finite(command.y, "viewport y");
        const width = finite(command.width, "viewport width"), height = finite(command.height, "viewport height");
        const minDepth = finite(command.minDepth ?? 0, "viewport minDepth"), maxDepth = finite(command.maxDepth ?? 1, "viewport maxDepth");
        dynamic = true;
        commands.push({ kind: command.kind, x, y, width, height, minDepth, maxDepth });
        break;
      }
      case "set-scissor-rect": {
        const x = uint(command.x, "scissor x"), y = uint(command.y, "scissor y");
        const width = uint(command.width, "scissor width"), height = uint(command.height, "scissor height");
        dynamic = true;
        commands.push({ kind: command.kind, x, y, width, height });
        break;
      }
      case "set-blend-constant": {
        if (!Array.isArray(command.color) || command.color.length !== 4) throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: blend constant requires four values");
        const color: [number, number, number, number] = [
          finite(command.color[0], "blend red"), finite(command.color[1], "blend green"),
          finite(command.color[2], "blend blue"), finite(command.color[3], "blend alpha")
        ];
        dynamic = true;
        commands.push({ kind: command.kind, color });
        break;
      }
      case "set-stencil-reference": {
        const reference = uint(command.reference, "stencil reference");
        dynamic = true;
        commands.push({ kind: command.kind, reference });
        break;
      }
      default:
        throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: unsupported command");
    }
  }
  return { descriptor, commands, signature, dynamic, incomplete };
}

function targetMethod(kind: NativeRenderBundleCommand["kind"]): keyof CommandTarget {
  switch (kind) {
    case "set-pipeline": return "setPipeline";
    case "set-bind-group": return "setBindGroup";
    case "set-vertex-buffer": return "setVertexBuffer";
    case "set-index-buffer": return "setIndexBuffer";
    case "draw": return "draw";
    case "draw-indexed": return "drawIndexed";
    case "draw-indirect": return "drawIndirect";
    case "draw-indexed-indirect": return "drawIndexedIndirect";
    case "set-viewport": return "setViewport";
    case "set-scissor-rect": return "setScissorRect";
    case "set-blend-constant": return "setBlendConstant";
    case "set-stencil-reference": return "setStencilReference";
  }
}

function assertTarget(target: object, commands: readonly NativeRenderBundleCommand[]): asserts target is CommandTarget {
  for (const command of commands) {
    const method = targetMethod(command.kind);
    if (typeof (target as Partial<CommandTarget>)[method] !== "function") {
      throw new Error(`WEBGPU_BUNDLE_PASS_UNAVAILABLE: ${method}`);
    }
  }
}

function encodeCommands(target: CommandTarget, commands: readonly NativeRenderBundleCommand[]): void {
  for (const command of commands) {
    switch (command.kind) {
      case "set-pipeline": target.setPipeline(command.pipeline); break;
      case "set-bind-group": target.setBindGroup(command.slot, command.group, command.dynamicOffsets as readonly number[]); break;
      case "set-vertex-buffer": target.setVertexBuffer(command.slot, command.buffer, command.offset, command.size); break;
      case "set-index-buffer": target.setIndexBuffer(command.buffer, command.format, command.offset, command.size); break;
      case "draw": target.draw(command.vertexCount, command.instanceCount, command.firstVertex, command.firstInstance); break;
      case "draw-indexed": target.drawIndexed(command.indexCount, command.instanceCount, command.firstIndex, command.baseVertex, command.firstInstance); break;
      case "draw-indirect": target.drawIndirect(command.buffer, command.offset); break;
      case "draw-indexed-indirect": target.drawIndexedIndirect(command.buffer, command.offset); break;
      case "set-viewport": target.setViewport(command.x, command.y, command.width, command.height, command.minDepth!, command.maxDepth!); break;
      case "set-scissor-rect": target.setScissorRect(command.x, command.y, command.width, command.height); break;
      case "set-blend-constant": target.setBlendConstant(command.color); break;
      case "set-stencil-reference": target.setStencilReference(command.reference); break;
    }
  }
}

function equalSignature(left: readonly SignaturePart[], right: readonly SignaturePart[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function direct(reason: NativeRenderBundleResult["reason"]): NativeRenderBundleResult {
  return { mode: "direct", reason, requiresStateRebind: true };
}

export class NativeRenderBundleCache {
  private readonly entries = new Map<NativeRenderBundleKey, CacheEntry>();
  private readonly unsubscribe: () => void;
  private device: object | undefined;
  private generation: number | undefined;
  private totalCommands = 0;
  private cacheEpoch = 0;
  private disposed = false;
  private encoding = false;

  constructor(private readonly owner: NativeRenderBundleOwner) {
    if (owner.disposed) throw new Error("WEBGPU_BUNDLE_DISPOSED: renderer is disposed");
    if (owner.contextLost) throw new Error("WEBGPU_BUNDLE_DEVICE_LOST: native device is unavailable");
    this.unsubscribe = owner.onDeviceLost?.(() => this.clear()) ?? (() => undefined);
  }

  encode(request: NativeRenderBundleRequest): NativeRenderBundleResult {
    if (this.encoding) throw new Error("WEBGPU_BUNDLE_REENTRANT: bundle encoding is already active");
    this.encoding = true;
    try {
      const native = this.currentDevice();
      const generation = this.owner.generation;
      if (request.key === null || request.key === undefined ||
          !["string", "number", "symbol", "object", "function"].includes(typeof request.key) ||
          (typeof request.key === "number" && !Number.isFinite(request.key))) {
        throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: invalid cache key");
      }
      if (request.passDevice !== native) throw new Error("WEBGPU_BUNDLE_FOREIGN_DEVICE: pass and bundle devices must match");
      requireObject(request.pass, "render pass");
      if (request.lifetime) {
        requireObject(request.lifetime.revision, "resource revision");
        if (typeof request.lifetime.isValid !== "function") throw new Error("WEBGPU_BUNDLE_INVALID_ARGUMENT: resource validation is required");
        this.assertResources(request, native, generation);
      }
      const prepared = prepare(request);
      const pass = request.pass;
      assertTarget(pass, prepared.commands);
      const fallback = (reason: NativeRenderBundleResult["reason"]): NativeRenderBundleResult => {
        this.assertResources(request, native, generation);
        encodeCommands(pass, prepared.commands);
        return direct(reason);
      };
      if (request.cacheable !== true) {
        this.invalidate(request.key);
        return fallback("disabled");
      }
      if (!request.lifetime) {
        this.invalidate(request.key);
        return fallback("untracked-resources");
      }
      if (prepared.dynamic) {
        this.invalidate(request.key);
        return fallback("dynamic-state");
      }
      if (prepared.incomplete) {
        this.invalidate(request.key);
        return fallback("incomplete-state");
      }
      const bundleDevice = native as Partial<BundleDevice>;
      const bundlePass = pass as Partial<BundlePass>;
      if (typeof bundleDevice.createRenderBundleEncoder !== "function" ||
          typeof bundleDevice.pushErrorScope !== "function" ||
          typeof bundleDevice.popErrorScope !== "function" ||
          typeof bundlePass.executeBundles !== "function") {
        this.invalidate(request.key);
        return fallback("unsupported");
      }
      const cost = Math.max(1, prepared.commands.length + prepared.signature.length);
      if (cost > MAX_CACHED_COST) {
        this.invalidate(request.key);
        return fallback("oversized");
      }
      let entry = this.entries.get(request.key);
      if (entry && !equalSignature(entry.signature, prepared.signature)) {
        this.invalidate(request.key);
        entry = undefined;
      }
      if (entry) {
        this.entries.delete(request.key);
        this.entries.set(request.key, entry);
        if (entry.state === "ready") {
          if (!entry.bundle) {
            this.invalidate(request.key);
            return fallback("capture-failed");
          }
          this.assertResources(request, native, generation);
          try {
            bundlePass.executeBundles([entry.bundle]);
          } catch (error) {
            this.invalidate(request.key);
            throw error;
          }
          return { mode: "bundle", reason: "reused", requiresStateRebind: true };
        }
        return fallback(entry.state === "pending" ? "validation-pending" : entry.state);
      }

      let pushed = false;
      let bundle: object | undefined;
      let failed = false;
      let validation: Promise<unknown | null> | undefined;
      const captureEpoch = this.cacheEpoch;
      try {
        bundleDevice.pushErrorScope("validation");
        pushed = true;
        const encoder = bundleDevice.createRenderBundleEncoder(prepared.descriptor);
        requireObject(encoder, "render bundle encoder");
        assertTarget(encoder, prepared.commands);
        encodeCommands(encoder, prepared.commands);
        bundle = encoder.finish();
        requireObject(bundle, "render bundle");
      } catch {
        failed = true;
      } finally {
        if (pushed) {
          try {
            const result = bundleDevice.popErrorScope();
            if (!result || typeof result.then !== "function") failed = true;
            else validation = Promise.resolve(result);
          } catch {
            failed = true;
          }
        }
      }
      if (validation) void validation.catch(() => undefined);
      this.assertResources(request, native, generation);
      if (captureEpoch !== this.cacheEpoch) return fallback("capture-failed");
      const captureFailed = failed || !validation || !bundle;
      entry = { signature: prepared.signature, cost, state: captureFailed ? "capture-failed" : "pending", bundle: captureFailed ? undefined : bundle };
      this.remember(request.key, entry);
      if (entry.state === "pending" && validation) {
        const pendingEntry = entry;
        void validation.then(
          (error) => {
            if (this.entries.get(request.key) !== pendingEntry || this.disposed) return;
            if (this.owner.disposed || this.owner.contextLost || this.owner.generation !== generation) {
              this.invalidate(request.key);
              return;
            }
            pendingEntry.state = error === null ? "ready" : "validation-failed";
            if (error !== null) pendingEntry.bundle = undefined;
          },
          () => {
            if (this.entries.get(request.key) !== pendingEntry || this.disposed) return;
            if (this.owner.disposed || this.owner.contextLost || this.owner.generation !== generation) {
              this.invalidate(request.key);
              return;
            }
            pendingEntry.state = "validation-failed";
            pendingEntry.bundle = undefined;
          }
        );
      }
      return fallback(entry.state === "pending" ? "validation-pending" : "capture-failed");
    } finally {
      this.encoding = false;
    }
  }

  invalidate(key?: NativeRenderBundleKey): void {
    if (key === undefined) {
      this.clear();
      return;
    }
    this.cacheEpoch += 1;
    const existing = this.entries.get(key);
    if (existing) {
      this.totalCommands -= existing.cost;
      this.entries.delete(key);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.unsubscribe();
  }

  private currentDevice(): object {
    if (this.disposed || this.owner.disposed) {
      this.clear();
      throw new Error("WEBGPU_BUNDLE_DISPOSED: renderer is disposed");
    }
    if (this.owner.contextLost) {
      this.clear();
      throw new Error("WEBGPU_BUNDLE_DEVICE_LOST: native device is unavailable");
    }
    let native: object | undefined;
    try {
      native = this.owner.nativeGpuDevice;
    } catch (error) {
      this.clear();
      throw error;
    }
    requireObject(native, "native device");
    if (native !== this.device || this.owner.generation !== this.generation) {
      this.clear();
      this.device = native;
      this.generation = this.owner.generation;
    }
    return native;
  }

  private assertResources(request: NativeRenderBundleRequest, native: object, generation: number | undefined): void {
    if (this.currentDevice() !== native || this.owner.generation !== generation) {
      throw new Error("WEBGPU_BUNDLE_DEVICE_CHANGED: native device is unavailable");
    }
    if (request.lifetime) {
      let valid: boolean;
      try {
        valid = request.lifetime.isValid() === true;
      } catch (error) {
        this.invalidate(request.key);
        throw error;
      }
      if (!valid) {
        this.invalidate(request.key);
        throw new Error("WEBGPU_BUNDLE_RESOURCE_INVALID: captured resources are no longer valid");
      }
    }
    if (this.currentDevice() !== native || this.owner.generation !== generation) {
      throw new Error("WEBGPU_BUNDLE_DEVICE_CHANGED: native device is unavailable");
    }
  }

  private remember(key: NativeRenderBundleKey, entry: CacheEntry): void {
    this.invalidate(key);
    while (this.entries.size >= MAX_CACHE_ENTRIES || this.totalCommands + entry.cost > MAX_CACHED_COST) {
      const oldest = this.entries.keys().next().value as NativeRenderBundleKey | undefined;
      if (oldest === undefined) break;
      this.invalidate(oldest);
    }
    this.entries.set(key, entry);
    this.totalCommands += entry.cost;
  }

  private clear(): void {
    this.cacheEpoch += 1;
    this.entries.clear();
    this.totalCommands = 0;
  }
}
