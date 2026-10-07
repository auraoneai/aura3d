/**
 * TextureBudget.ts — R16 texture budgeting seam (PRD-04 §7.3, P1-7; seam host
 * per CONTRACTS §3.4). Pure descriptor transforms plus a per-device ledger.
 *
 * Policy fields: the C-27 seam names (`textureBudgetBytes`, `maxTextureSize`)
 * are authoritative; the §7.3 names (`maxBytes`, `maxDimension`) are accepted
 * aliases so call sites written against the PRD work unchanged.
 *
 *   applyTextureBudget(desc, policy, device?)
 *     - `maxDimension`: power-of-2 downscale — uncompressed `data`/`mipLevels`
 *       get box-filtered mip levels; compressed mip chains (KTX2-uploaded)
 *       drop leading levels until the base is ≤ maxDimension.
 *     - `maxBytes`: per-device ledger (WeakMap<RenderDevice, Ledger>; a
 *       shared "no-device" ledger covers callers without one). When the
 *       ledger overflows, entries lose top mip levels largest-first until the
 *       ledger fits; `textureBudgetReport` surfaces {id, from, to}.
 */

import type { RenderDevice } from "../RenderDevice";
import {
  compressedTextureByteLength,
  isCompressedTextureFormat,
  Texture,
  type TextureDescriptor,
  type TextureMipLevelDescriptor
} from "../Texture";

export interface TextureBudgetPolicy {
  /** C-27 name — alias of `maxBytes`. */
  readonly textureBudgetBytes?: number;
  /** C-27 name — alias of `maxDimension`. */
  readonly maxTextureSize?: number;
  /** §7.3 name — cap on total admitted texture bytes per device. */
  readonly maxBytes?: number;
  /** §7.3 name — cap on the texture's longest side. */
  readonly maxDimension?: number;
}

export const DEFAULT_TEXTURE_BUDGET_POLICY: TextureBudgetPolicy = {};

interface LedgerEntry {
  readonly id: string;
  /** Byte cost of each mip level (largest first), or [baseBytes] when unknown. */
  levels: number[];
  /** True when the entry can still drop a leading level. */
  canDrop: boolean;
}

interface TextureBudgetLedger {
  bytes: number;
  readonly entries: Map<string, LedgerEntry>;
  readonly downscaled: { id: string; from: number; to: number }[];
}

const DEVICE_LEDGERS = new WeakMap<object, TextureBudgetLedger>();
const NO_DEVICE_LEDGER: TextureBudgetLedger = { bytes: 0, entries: new Map(), downscaled: [] };
let nextAnonId = 0;

function ledgerFor(device: RenderDevice | undefined): TextureBudgetLedger {
  if (device === undefined || device === null) return NO_DEVICE_LEDGER;
  let ledger = DEVICE_LEDGERS.get(device);
  if (!ledger) {
    ledger = { bytes: 0, entries: new Map(), downscaled: [] };
    DEVICE_LEDGERS.set(device, ledger);
  }
  return ledger;
}

function maxDimensionOf(policy: TextureBudgetPolicy): number | undefined {
  return policy.maxDimension ?? policy.maxTextureSize;
}

function maxBytesOf(policy: TextureBudgetPolicy): number | undefined {
  return policy.maxBytes ?? policy.textureBudgetBytes;
}

/** Floor at `max`, snapped down to a power of two. */
function floorPow2(value: number, max: number): number {
  let target = Math.min(value, max);
  let p = 1;
  while (p * 2 <= target) p *= 2;
  return p;
}

function mipLevelBytes(desc: TextureDescriptor, level: { width: number; height: number }): number {
  const format = desc.format ?? "rgba8";
  if (isCompressedTextureFormat(format)) return compressedTextureByteLength(level.width, level.height, format);
  const bpp = format === "rgba16f" ? 8 : format === "rgba32f" ? 16 : 4;
  return level.width * level.height * bpp;
}

/** Structural view over both TextureDescriptor and Texture instances. */
type TextureLike = Pick<
  TextureDescriptor,
  "width" | "height"
> & {
  readonly format?: TextureDescriptor["format"];
  readonly label?: string;
  readonly data?: TextureDescriptor["data"] | null;
  readonly mipLevels?: readonly { width: number; height: number; data: { byteLength: number } }[];
  readonly cubeFaces?: readonly { mipLevels: readonly { width: number; height: number; data: { byteLength: number } }[] }[];
};

function descriptorByteLevels(desc: TextureLike): number[] {
  if (desc.mipLevels && desc.mipLevels.length > 0) {
    return desc.mipLevels.map((level) => level.data.byteLength);
  }
  if (desc.cubeFaces && desc.cubeFaces.length > 0) {
    const first = desc.cubeFaces[0];
    return first.mipLevels.length > 0
      ? first.mipLevels.map((level) => level.data.byteLength * desc.cubeFaces!.length)
      : [desc.width * desc.height * 4 * desc.cubeFaces.length];
  }
  return [desc.data?.byteLength ?? mipLevelBytes(desc as TextureDescriptor, desc)];
}

/** Box-filter downscale of an uncompressed RGBA mip chain to `base` (power of two). */
function downscaleMips(
  desc: TextureDescriptor,
  baseWidth: number,
  baseHeight: number
): TextureMipLevelDescriptor[] | undefined {
  const source = desc.mipLevels?.[0] ?? (desc.data ? { width: desc.width, height: desc.height, data: desc.data } : undefined);
  if (!source || !(source.data instanceof Uint8Array || source.data instanceof Uint8ClampedArray)) return undefined;
  const levels: TextureMipLevelDescriptor[] = [];
  let data = new Uint8Array(source.data);
  let w = source.width;
  let h = source.height;
  while (w > baseWidth || h > baseHeight) {
    const nw = Math.max(baseWidth, w >> 1);
    const nh = Math.max(baseHeight, h >> 1);
    const sx = w / nw;
    const sy = h / nh;
    const out = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let dy = 0; dy < sy; dy++) {
          for (let dx = 0; dx < sx; dx++) {
            const i = ((Math.floor(y * sy + dy) % h) * w + (Math.floor(x * sx + dx) % w)) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
            n++;
          }
        }
        const o = (y * nw + x) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
      }
    }
    levels.push({ width: nw, height: nh, data: out });
    data = out;
    w = nw;
    h = nh;
  }
  return levels;
}

/**
 * Drop leading mip levels on a compressed/explicit chain until the base is
 * ≤ `maxDimension` — equivalent to starting the KTX2 upload at a later level.
 */
function dropLeadingMips(desc: TextureDescriptor, maxDim: number): TextureDescriptor {
  if (!desc.mipLevels || desc.mipLevels.length === 0) return desc;
  const drop = desc.mipLevels.findIndex((l) => l.width <= maxDim && l.height <= maxDim);
  if (drop <= 0) return desc;
  const levels = desc.mipLevels.slice(drop);
  const base = levels[0];
  return { ...desc, width: base.width, height: base.height, mipLevels: levels, data: undefined };
}

function recordDownscale(ledger: TextureBudgetLedger, entry: LedgerEntry): void {
  const from = entry.levels.reduce((a, b) => a + b, 0);
  entry.levels.shift();
  const to = entry.levels.reduce((a, b) => a + b, 0);
  entry.canDrop = entry.levels.length > 1;
  ledger.downscaled.push({ id: entry.id, from, to });
  ledger.bytes -= from - to;
}

export function applyTextureBudget<T extends Texture | TextureDescriptor>(
  desc: T,
  policy: TextureBudgetPolicy = DEFAULT_TEXTURE_BUDGET_POLICY,
  device?: RenderDevice
): T {
  const maxDim = maxDimensionOf(policy);
  let out: TextureDescriptor | undefined;

  if (maxDim !== undefined && (desc.width > maxDim || desc.height > maxDim)) {
    const long = Math.max(desc.width, desc.height);
    const scale = floorPow2(long, maxDim) / long;
    const baseWidth = Math.max(1, Math.round(desc.width * scale));
    const baseHeight = Math.max(1, Math.round(desc.height * scale));
    if (desc.mipLevels && desc.mipLevels.length > 0) {
      out = dropLeadingMips(desc as TextureDescriptor, maxDim);
    } else {
      const levels = downscaleMips(desc as TextureDescriptor, baseWidth, baseHeight);
      if (levels) {
        out = { ...(desc as TextureDescriptor), width: baseWidth, height: baseHeight, data: undefined, mipLevels: levels };
      }
    }
  }

  const ledger = ledgerFor(device);
  const id = (desc as TextureLike).label ?? `texture-${nextAnonId++}`;
  const levels = descriptorByteLevels(out ?? (desc as TextureLike));
  const entry: LedgerEntry = { id, levels: [...levels], canDrop: levels.length > 1 };
  ledger.entries.set(id, entry);
  ledger.bytes += levels.reduce((a, b) => a + b, 0);

  const maxBytes = maxBytesOf(policy);
  if (maxBytes !== undefined && ledger.bytes > maxBytes) {
    // Largest-first: shrink the biggest entries' leading mip until we fit.
    const shrinkable = () => [...ledger.entries.values()].filter((e) => e.canDrop);
    while (ledger.bytes > maxBytes && shrinkable().length > 0) {
      const biggest = shrinkable().reduce((a, b) => (a.levels[0] >= b.levels[0] ? a : b));
      recordDownscale(ledger, biggest);
    }
  }

  if (out === undefined) return desc;
  // Texture instances (the upload path) need a real Texture back so the
  // caller keeps its runtime type; plain descriptors get the modified object.
  return (desc instanceof Texture ? new Texture(out) : out) as T;
}

export function textureBudgetReport(device?: RenderDevice): {
  readonly textureBytes: number;
  readonly downscaled: readonly { id: string; from: number; to: number }[];
} {
  const ledger = ledgerFor(device);
  return { textureBytes: ledger.bytes, downscaled: ledger.downscaled };
}

/** Test hook — clears a device's ledger (and the no-device ledger). */
export function resetTextureBudgetLedger(device?: RenderDevice): void {
  const ledger = ledgerFor(device);
  ledger.bytes = 0;
  ledger.entries.clear();
  ledger.downscaled.length = 0;
}
