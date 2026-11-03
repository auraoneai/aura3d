/** Per-device texture admission and accounting for live or retiring allocations. */
import type { RenderDevice } from "../RenderDevice";
import { bytesPerPixel, compressedTextureByteLength, isCompressedTextureFormat, Texture, type TextureDescriptor, type TextureMipLevelDescriptor, type TexturePixelData } from "../Texture";
import { planNativeDataMipmaps, type NativeDataMipSource } from "../webgpu/NativeDataMipmaps";

export interface TextureBudgetPolicy {
  readonly textureBudgetBytes?: number;
  readonly maxTextureSize?: number;
  readonly maxBytes?: number;
  readonly maxDimension?: number;
}
export const DEFAULT_TEXTURE_BUDGET_POLICY: TextureBudgetPolicy = {};

export class TextureBudgetExceededError extends Error {
  readonly code = "TEXTURE_BUDGET_EXCEEDED";
  constructor(message: string) { super(message); this.name = "TextureBudgetExceededError"; }
}

interface Entry {
  readonly original: object;
  readonly result: object;
  readonly id: string;
  bytes: number;
  limit: number | undefined;
}
interface Ledger {
  bytes: number;
  readonly entries: Map<object, Entry>;
  readonly retired: Set<Entry>;
  readonly reservations: Set<{ readonly bytes: number }>;
  readonly limitLeases: Set<{ limit: number }>;
  readonly limits: Map<number, number>;
  minLimit: number;
  readonly downscaled: { id: string; from: number; to: number }[];
}
const DEVICE_LEDGERS = new WeakMap<object, Ledger>();
// An optional scope partitions nonresident admission (for example decoded
// source planning) from the physical allocation ledger owned by the device.
// Neither a source reservation nor its disposal may change GPU residency.
const SCOPED_DEVICE_LEDGERS = new WeakMap<object, WeakMap<object, Ledger>>();
function newLedger(): Ledger {
  return { bytes: 0, entries: new Map(), retired: new Set(), reservations: new Set(), limitLeases: new Set(), limits: new Map(), minLimit: Infinity, downscaled: [] };
}
const NO_DEVICE_LEDGER = newLedger();
function ledgerFor(device?: RenderDevice, scope?: object): Ledger {
  if (scope) {
    if (!device) throw new Error("A scoped texture budget requires a render device.");
    let byDevice = SCOPED_DEVICE_LEDGERS.get(scope);
    if (!byDevice) { byDevice = new WeakMap(); SCOPED_DEVICE_LEDGERS.set(scope, byDevice); }
    let ledger = byDevice.get(device);
    if (!ledger) { ledger = newLedger(); byDevice.set(device, ledger); }
    return ledger;
  }
  if (!device) return NO_DEVICE_LEDGER;
  let ledger = DEVICE_LEDGERS.get(device);
  if (!ledger) { ledger = newLedger(); DEVICE_LEDGERS.set(device, ledger); }
  return ledger;
}

function effectiveLimit(ledger: Ledger, requested?: number): number {
  return Math.min(ledger.minLimit, requested ?? Infinity);
}

function addLimit(ledger: Ledger, limit: number | undefined): void {
  if (limit === undefined) return;
  ledger.limits.set(limit, (ledger.limits.get(limit) ?? 0) + 1);
  ledger.minLimit = Math.min(ledger.minLimit, limit);
}

function removeLimit(ledger: Ledger, limit: number | undefined): void {
  if (limit === undefined) return;
  const count = ledger.limits.get(limit);
  if (count === undefined) return;
  if (count > 1) ledger.limits.set(limit, count - 1);
  else {
    ledger.limits.delete(limit);
    if (limit === ledger.minLimit) {
      ledger.minLimit = Infinity;
      for (const remaining of ledger.limits.keys()) ledger.minLimit = Math.min(ledger.minLimit, remaining);
    }
  }
}

function validatePolicy(policy: TextureBudgetPolicy): { maxBytes?: number; maxDimension?: number } {
  const maxBytes = policy.maxBytes ?? policy.textureBudgetBytes;
  const maxDimension = policy.maxDimension ?? policy.maxTextureSize;
  if (maxBytes !== undefined && (!Number.isFinite(maxBytes) || maxBytes < 0)) throw new Error("Texture budget maxBytes must be finite and non-negative.");
  if (maxDimension !== undefined && (!Number.isInteger(maxDimension) || maxDimension < 1)) throw new Error("Texture budget maxDimension must be a positive integer.");
  return { maxBytes, maxDimension };
}

/** Texture has nullable/empty members; normalize it before constructing another Texture. */
function descriptorOf(texture: Texture | TextureDescriptor): TextureDescriptor {
  if (!(texture instanceof Texture)) return texture;
  const hasValidFallback = texture.fallbackTextureLevels.length > 0;
  return {
    width: texture.width, height: texture.height, dimension: texture.dimension,
    format: texture.format, colorSpace: texture.colorSpace, label: texture.label,
    ...(texture.data ? { data: texture.getMipLevel(0)?.data ?? texture.data } : {}),
    ...(texture.mipLevels.length ? { mipLevels: texture.mipLevels.map((level, index) => texture.getMipLevel(index) ?? level) } : {}),
    ...(texture.cubeFaces.length ? { cubeFaces: texture.cubeFaces.map((face) => ({ ...face, mipLevels: face.mipLevels.map((level, index) => texture.getMipLevel(index, face.face) ?? level) })) } : {}),
    ...(texture.source ? { source: texture.source } : {}),
    // A replacement supplied after a compressed edit is the current fallback.
    ...(hasValidFallback && texture.fallbackReplaced ? { fallbackMipLevels: texture.fallbackTextureLevels } : {}),
    ...(hasValidFallback && !texture.fallbackReplaced && texture.fallbackData ? { fallbackData: texture.fallbackData } : {}),
    ...(hasValidFallback && !texture.fallbackReplaced && texture.fallbackMipLevels.length ? { fallbackMipLevels: texture.fallbackMipLevels } : {}),
    ...(texture.dimension === "2d-array" ? { layers: texture.layers } : {}),
    ...(texture.dimension === "3d" ? { depth: texture.depth } : {}),
    mipLevelCount: texture.mipLevelCount,
    usage: texture.usage, dynamic: texture.dynamic, flipY: texture.flipY, generateMipmaps: texture.generateMipmaps
  };
}

function sourceExtent(desc: TextureDescriptor): readonly [number, number] {
  const source = desc.source as unknown as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; displayWidth?: number; displayHeight?: number; width?: number; height?: number } | undefined;
  if (!source) return [desc.width, desc.height];
  return [source.videoWidth ?? source.naturalWidth ?? source.displayWidth ?? source.width ?? desc.width,
    source.videoHeight ?? source.naturalHeight ?? source.displayHeight ?? source.height ?? desc.height];
}

/** Match Texture's defaults without cloning its potentially large pixel data. */
function descriptorMipSource(desc: TextureDescriptor, mipLevelCount: number): NativeDataMipSource {
  const levels = desc.mipLevels ?? [];
  const data = desc.data;
  return {
    width: desc.width, height: desc.height,
    dimension: desc.dimension ?? (desc.cubeFaces ? "cube" : "2d"),
    format: desc.format ?? "rgba8", label: desc.label ?? "texture",
    source: desc.source ?? null,
    usage: desc.usage ?? ["sampled", "copy-dst", ...(desc.renderAttachment ? ["render-attachment" as const, "copy-src" as const] : [])],
    mipLevelCount, generateMipmaps: desc.generateMipmaps ?? true,
    getMipLevel(level) {
      if (levels.length) return levels[level] ?? null;
      return level === 0 && data ? { width: desc.width, height: desc.height, data } : null;
    }
  };
}

/** Account for allocated subresources, including levels without uploaded data. */
function residentBytes(desc: TextureDescriptor, device?: RenderDevice, original?: Texture): number {
  const dimension = desc.dimension ?? (desc.cubeFaces ? "cube" : "2d");
  const format = desc.format ?? "rgba8";
  let [width, height] = sourceExtent(desc);
  let depth = dimension === "3d" ? desc.depth ?? 1 : 1;
  const planes = dimension === "cube" ? 6 : dimension === "2d-array" ? desc.layers ?? 1 : 1;
  if (![desc.width, desc.height, width, height, depth, planes].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Texture budget requires positive, safe integer dimensions and layers.");
  }

  const suppliedLevels = dimension === "cube"
    ? Math.max(0, ...(desc.cubeFaces?.map((face) => face.mipLevels.length) ?? []))
    : desc.mipLevels?.length ?? 0;
  const declaredLevels = desc.mipLevelCount ?? (suppliedLevels || 1);
  const declaredMaxLevels = Math.floor(Math.log2(Math.max(desc.width, desc.height, depth))) + 1;
  if (!Number.isInteger(declaredLevels) || declaredLevels < Math.max(1, suppliedLevels) || declaredLevels > declaredMaxLevels) {
    throw new Error(`Texture mipLevelCount must contain the supplied levels and be between 1 and ${declaredMaxLevels}`);
  }

  // WebGPU's planner accounts for authored levels and sparse overrides as well
  // as generated descendants. Use the original when edits live only in it.
  if (device?.kind === "webgpu") {
    const plan = planNativeDataMipmaps(original ?? descriptorMipSource(desc, declaredLevels));
    if (plan) return plan.residentBytes;
  }
  // Source uploads use their actual source extent. WebGL also generates a
  // chain for flat RGBA8 data.
  const generatesLevels = (desc.generateMipmaps ?? true) && (desc.source !== undefined ||
    (device?.kind !== "webgpu" && dimension === "2d" && format === "rgba8" && suppliedLevels === 0 && declaredLevels === 1));
  const levelCount = generatesLevels ? Math.floor(Math.log2(Math.max(width, height, depth))) + 1 : desc.source ? 1 : declaredLevels;
  let total = 0;
  for (let level = 0; level < levelCount; level += 1) {
    const layerBytes = isCompressedTextureFormat(format) ? compressedTextureByteLength(width, height, format) : width * height * bytesPerPixel(format);
    total += layerBytes * planes * depth;
    if (!Number.isSafeInteger(total)) throw new Error("Texture residency exceeds safe integer byte accounting.");
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
    if (dimension === "3d") depth = Math.max(1, Math.floor(depth / 2));
  }
  return total;
}

function halfRgba(width: number, height: number, input: Uint8Array | Uint8ClampedArray): TextureMipLevelDescriptor {
  const w = Math.max(1, Math.floor(width / 2));
  const h = Math.max(1, Math.floor(height / 2));
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * width / w), x1 = Math.floor((x + 1) * width / w);
    const y0 = Math.floor(y * height / h), y1 = Math.floor((y + 1) * height / h);
    const count = (x1 - x0) * (y1 - y0);
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) sum += input[(sy * width + sx) * 4 + c]!;
      data[(y * w + x) * 4 + c] = Math.round(sum / count);
    }
  }
  return { width: w, height: h, data };
}

/** Return a physically smaller descriptor, or undefined if none can be made safely. */
function dropOneLevel(desc: TextureDescriptor): TextureDescriptor | undefined {
  // Rebased volume/array mips would change the destination of later subresource updates.
  if (desc.dynamic || desc.source || desc.dimension === "3d" || desc.dimension === "2d-array" ||
      (desc.layers ?? 1) !== 1 || (desc.depth ?? 1) !== 1) return undefined;
  const mipLevelCount = desc.mipLevelCount === undefined ? undefined : Math.max(1, desc.mipLevelCount - 1);
  if (desc.cubeFaces?.length) {
    if (desc.cubeFaces.some((face) => face.mipLevels.length < 2)) return undefined;
    const cubeFaces = desc.cubeFaces.map((face) => ({ ...face, mipLevels: face.mipLevels.slice(1) }));
    const first = cubeFaces[0]!.mipLevels[0]!;
    return { ...desc, width: first.width, height: first.height, cubeFaces, mipLevelCount };
  }
  if (desc.mipLevels && desc.mipLevels.length > 1) {
    const mipLevels = desc.mipLevels.slice(1);
    const first = mipLevels[0]!;
    let fallbackMipLevels = desc.fallbackMipLevels?.slice(1);
    if (desc.fallbackData && !desc.fallbackMipLevels?.length) fallbackMipLevels = [halfRgba(desc.width, desc.height, desc.fallbackData)];
    if (fallbackMipLevels && (fallbackMipLevels[0]?.width !== first.width || fallbackMipLevels[0]?.height !== first.height)) return undefined;
    return { ...desc, width: first.width, height: first.height, mipLevels, mipLevelCount, data: undefined,
      fallbackData: undefined, fallbackMipLevels };
  }
  const data: TexturePixelData | undefined = desc.data ?? desc.mipLevels?.[0]?.data;
  if ((desc.format ?? "rgba8") !== "rgba8" || !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || (desc.width === 1 && desc.height === 1)) return undefined;
  if (data.byteLength !== desc.width * desc.height * 4) return undefined;
  const next = halfRgba(desc.width, desc.height, data);
  // Keep explicitly supplied mip data explicit, so a one-level result does
  // not suddenly request implicit WebGL mip generation.
  if (desc.mipLevels?.length) return { ...desc, width: next.width, height: next.height, data: undefined, mipLevels: [next], mipLevelCount };
  return { ...desc, width: next.width, height: next.height, data: next.data, mipLevels: undefined, mipLevelCount,
    ...((desc.mipLevelCount ?? 1) > 1 && mipLevelCount === 1 ? { generateMipmaps: false } : {}) };
}

/** Some updated levels have no representation in the original descriptor. */
function hasUnrepresentedMipContent(texture: Texture): boolean {
  if (texture.dimension === "cube") {
    for (const face of texture.cubeFaces) {
      for (let level = face.mipLevels.length; level < texture.mipLevelCount; level += 1) {
        if (texture.getMipLevel(level, face.face)) return true;
      }
    }
    return false;
  }
  const supplied = texture.mipLevels.length || (texture.data ? 1 : 0);
  for (let level = supplied; level < texture.mipLevelCount; level += 1) {
    if (texture.getMipLevel(level)) return true;
  }
  return false;
}

/**
 * Admit a texture for one device. Existing allocations are never silently shrunk:
 * the new texture must fit in the remaining space, or admission fails atomically.
 * An optional scope creates a separate, device-specific admission namespace;
 * it does not contribute to the device's physical residency report.
 */
export function applyTextureBudget<T extends Texture | TextureDescriptor>(desc: T, policy: TextureBudgetPolicy = DEFAULT_TEXTURE_BUDGET_POLICY, device?: RenderDevice, scope?: object): T {
  const { maxBytes, maxDimension } = validatePolicy(policy);
  const ledger = ledgerFor(device, scope);
  const existing = ledger.entries.get(desc);
  if (existing) {
    if (ledger.bytes > effectiveLimit(ledger, maxBytes)) throw new TextureBudgetExceededError("Existing texture residency exceeds the requested budget.");
    const current = descriptorOf(existing.result as Texture | TextureDescriptor);
    const [width, height] = sourceExtent(current);
    if (maxDimension !== undefined && Math.max(width, height, current.dimension === "3d" ? current.depth ?? 1 : 1) > maxDimension) {
      throw new TextureBudgetExceededError("Existing texture dimensions exceed the requested budget.");
    }
    if (maxBytes !== undefined && maxBytes < (existing.limit ?? Infinity)) {
      removeLimit(ledger, existing.limit);
      existing.limit = maxBytes;
      addLimit(ledger, maxBytes);
    }
    return existing.result as T;
  }
  let output = descriptorOf(desc);
  const originalBytes = residentBytes(output, device, desc instanceof Texture ? desc : undefined);
  let bytes = originalBytes;
  const available = Math.max(0, effectiveLimit(ledger, maxBytes) - ledger.bytes);
  let leaseLimit = Infinity;
  for (const lease of ledger.limitLeases) leaseLimit = Math.min(leaseLimit, lease.limit);
  const leaseAvailable = Math.max(0, leaseLimit - ledger.bytes);
  let [width, height] = sourceExtent(output);
  while ((maxDimension !== undefined && Math.max(width, height, output.dimension === "3d" ? output.depth ?? 1 : 1) > maxDimension) || bytes > available) {
    const exceedsDimension = maxDimension !== undefined && Math.max(width, height, output.dimension === "3d" ? output.depth ?? 1 : 1) > maxDimension;
    if (!exceedsDimension && bytes > leaseAvailable) {
      throw new TextureBudgetExceededError(`Texture ${output.label ?? "texture"} cannot fit in the active streaming budget without downscaling.`);
    }
    if (desc instanceof Texture && hasUnrepresentedMipContent(desc)) {
      throw new TextureBudgetExceededError(`Texture ${output.label ?? "texture"} has updated mip data that cannot be safely downscaled.`);
    }
    if (desc instanceof Texture && (desc.usage.includes("storage") || desc.usage.includes("render-attachment"))) {
      throw new TextureBudgetExceededError(`Writable texture ${output.label ?? "texture"} cannot be downscaled to fit the budget without changing its coordinates.`);
    }
    // Downscale contract (5.0): the budget returns a new texture identity whose
    // whole chain is replaced consistently. Supplied levels keep their exact
    // bytes (top levels are dropped); a lone base level is box-filtered. Both
    // devices reallocate that copy on any later revision of the original, so
    // no update is applied to a rebased level index. Refuse only where the
    // replacement would silently change content: WebGPU derives missing levels
    // from the base with linear-light filtering, so a downscaled base would
    // change every derived level. Scoped admission plans a separate
    // nonresident source and never owns a device mip chain.
    if (desc instanceof Texture && !scope && device?.kind === "webgpu" && planNativeDataMipmaps(desc) !== null) {
      throw new TextureBudgetExceededError(`Texture ${output.label ?? "texture"} has a generated WebGPU mip chain that cannot be safely downscaled to fit the budget without changing its derived levels.`);
    }
    const smaller = dropOneLevel(output);
    if (!smaller) throw new TextureBudgetExceededError(`Texture ${output.label ?? "texture"} cannot fit in the available texture budget.`);
    output = smaller;
    [width, height] = sourceExtent(output);
    bytes = residentBytes(output, device);
  }
  const result = output === desc || (desc instanceof Texture && output.width === desc.width && output.height === desc.height && bytes === originalBytes)
    ? desc : desc instanceof Texture ? new Texture(output) : output as T;
  const entry: Entry = { original: desc, result, id: desc.label ?? "texture", bytes, limit: maxBytes };
  if (!Number.isSafeInteger(ledger.bytes + bytes)) throw new Error("Texture residency exceeds safe integer byte accounting.");
  ledger.entries.set(desc, entry);
  ledger.entries.set(result, entry);
  addLimit(ledger, entry.limit);
  ledger.bytes += bytes;
  if (bytes !== originalBytes) ledger.downscaled.push({ id: entry.id, from: originalBytes, to: bytes });
  return result as T;
}

/** Adjust the charge when a device selects a different upload representation, e.g. RGBA fallback. */
export function setTextureBudgetResidentBytes(texture: Texture | TextureDescriptor, bytes: number, device?: RenderDevice): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Resident texture bytes must be a non-negative safe integer.");
  const ledger = ledgerFor(device);
  const entry = ledger.entries.get(texture);
  if (!entry) throw new Error("Texture is not admitted to this device budget.");
  const nextTotal = ledger.bytes - entry.bytes + bytes;
  if (!Number.isSafeInteger(nextTotal)) throw new Error("Texture residency exceeds safe integer byte accounting.");
  if (nextTotal > effectiveLimit(ledger)) throw new TextureBudgetExceededError("Texture upload representation exceeds the available texture budget.");
  ledger.bytes = nextTotal;
  entry.bytes = bytes;
}

/**
 * Reserve a same-handle storage redefinition while prior GPU uses can still
 * reference the old storage. Both representations remain charged until the
 * caller retires the returned overlap charge after a fence.
 */
export function beginTextureBudgetResize(texture: Texture | TextureDescriptor, bytes: number, device?: RenderDevice): { commit(): () => void; rollback(): () => void } {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Resident texture bytes must be a non-negative safe integer.");
  const ledger = ledgerFor(device);
  const entry = ledger.entries.get(texture);
  if (!entry) throw new Error("Texture is not admitted to this device budget.");
  const previous = entry.bytes;
  const total = ledger.bytes + bytes;
  if (!Number.isSafeInteger(total)) throw new Error("Texture residency exceeds safe integer byte accounting.");
  if (total > effectiveLimit(ledger)) throw new TextureBudgetExceededError("Texture resize exceeds the available texture budget while old storage is in flight.");
  const overlap = { bytes: previous };
  ledger.reservations.add(overlap);
  ledger.bytes = total;
  entry.bytes = bytes;
  let open = true;
  const release = (): void => {
    if (ledger.reservations.delete(overlap)) ledger.bytes -= overlap.bytes;
  };
  return {
    commit(): () => void {
      if (!open) throw new Error("Texture resize transaction is already closed.");
      open = false;
      return release;
    },
    rollback(): () => void {
      if (!open) throw new Error("Texture resize transaction is already closed.");
      open = false;
      if (!ledger.reservations.has(overlap)) return () => {};
      if (ledger.entries.get(texture) === entry) {
        entry.bytes = previous;
        // The failed replacement may have submitted work, so keep its own
        // charge until the cleanup fence, while the entry represents old data.
        overlap.bytes = bytes;
      }
      return release;
    }
  };
}

/**
 * Reserve an exact physical allocation in the same ledger as ordinary
 * textures. The caller keeps the release function until native destruction
 * really completes; it may also use it to roll back a failed allocation.
 * `maxBytes` is an admission limit for this transaction, not a persistent
 * minimum: a residency controller may subsequently increase its budget.
 */
export function reserveTextureBudget(bytes: number, maxBytes?: number, device?: RenderDevice): () => void {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Resident texture bytes must be a non-negative safe integer.");
  if (maxBytes !== undefined && (!Number.isFinite(maxBytes) || maxBytes < 0)) throw new Error("Texture budget maxBytes must be finite and non-negative.");
  const ledger = ledgerFor(device);
  const nextTotal = ledger.bytes + bytes;
  if (!Number.isSafeInteger(nextTotal)) throw new Error("Texture residency exceeds safe integer byte accounting.");
  if (nextTotal > effectiveLimit(ledger, maxBytes)) throw new TextureBudgetExceededError("Texture allocation exceeds the available texture budget.");
  const reservation = { bytes };
  ledger.reservations.add(reservation);
  ledger.bytes = nextTotal;
  return () => {
    // A context reset also clears reservations. A late release must not debit a
    // fresh generation or another allocation.
    if (ledger.reservations.delete(reservation)) ledger.bytes -= reservation.bytes;
  };
}

/**
 * A mutable, device-wide admission ceiling. Lowering it does not fabricate
 * releases: existing allocations remain charged, and later allocations wait
 * until real retirement creates enough room. Each owner releases only its own
 * lease, so independent limits compose by taking the minimum.
 */
export function acquireTextureBudgetLimit(maxBytes: number, device?: RenderDevice): { setLimit(maxBytes: number): void; release(): void } {
  const check = (value: number): void => {
    if (!Number.isFinite(value) || value < 0) throw new Error("Texture budget maxBytes must be finite and non-negative.");
  };
  check(maxBytes);
  const ledger = ledgerFor(device);
  const lease = { limit: maxBytes };
  ledger.limitLeases.add(lease);
  addLimit(ledger, maxBytes);
  return {
    setLimit(next): void {
      check(next);
      if (!ledger.limitLeases.has(lease)) throw new Error("Texture budget limit lease has been released.");
      if (next === lease.limit) return;
      removeLimit(ledger, lease.limit);
      lease.limit = next;
      addLimit(ledger, next);
    },
    release(): void {
      if (ledger.limitLeases.delete(lease)) removeLimit(ledger, lease.limit);
    }
  };
}

/** Release either identity exactly once, from the same namespace as admission. */
export function releaseTextureBudget(texture: Texture | TextureDescriptor, device?: RenderDevice, scope?: object): void {
  const ledger = ledgerFor(device, scope);
  const entry = ledger.entries.get(texture);
  if (!entry) return;
  ledger.entries.delete(entry.original);
  ledger.entries.delete(entry.result);
  removeLimit(ledger, entry.limit);
  ledger.bytes -= entry.bytes;
}

/** Detach a retiring allocation while it remains charged until its device fence completes. */
export function retireTextureBudget(texture: Texture | TextureDescriptor, device?: RenderDevice): () => void {
  const ledger = ledgerFor(device);
  const entry = ledger.entries.get(texture);
  if (!entry) return () => {};
  ledger.entries.delete(entry.original);
  ledger.entries.delete(entry.result);
  ledger.retired.add(entry);
  return () => {
    if (ledger.retired.delete(entry)) {
      removeLimit(ledger, entry.limit);
      ledger.bytes -= entry.bytes;
    }
  };
}

export function textureBudgetReport(device?: RenderDevice): { readonly textureBytes: number; readonly downscaled: readonly { id: string; from: number; to: number }[] } {
  const ledger = ledgerFor(device);
  return { textureBytes: ledger.bytes, downscaled: [...ledger.downscaled] };
}

/** Allocation-free byte lookup for per-frame device diagnostics. */
export function textureBudgetUsage(device?: RenderDevice): number {
  return ledgerFor(device).bytes;
}

/** Current resident charge for one admitted identity, or undefined for non-ledger resources. */
export function textureBudgetResidentBytes(texture: Texture | TextureDescriptor, device?: RenderDevice): number | undefined {
  return ledgerFor(device).entries.get(texture)?.bytes;
}

export function resetTextureBudgetLedger(device?: RenderDevice): void {
  const ledger = ledgerFor(device);
  ledger.bytes = 0; ledger.entries.clear(); ledger.retired.clear(); ledger.reservations.clear(); ledger.limitLeases.clear(); ledger.limits.clear(); ledger.minLimit = Infinity; ledger.downscaled.length = 0;
}
