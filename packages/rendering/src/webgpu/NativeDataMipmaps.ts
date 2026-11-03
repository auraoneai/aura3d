import { RenderDeviceError } from "../RenderDevice";
import { isCompressedTextureFormat, type Texture, type TextureMipLevel } from "../Texture";

// Generation is synchronous, so bound both its work and all temporary output
// arrays independent of the GPU residency budget. No generated data is cached.
const MAX_SOURCE_PIXELS = 16 * 1024 * 1024;
const MAX_GENERATED_BYTES = 32 * 1024 * 1024;

export interface NativeDataMipPlan {
  readonly mipLevelCount: number;
  readonly residentBytes: number;
}

/** The planner can also inspect a descriptor before a Texture is constructed. */
export type NativeDataMipSource = Pick<Texture,
  "width" | "height" | "dimension" | "format" | "label" | "source" | "usage" |
  "mipLevelCount" | "generateMipmaps" | "getMipLevel">;

/**
 * The CPU generator handles sampled, CPU-authored 2D RGBA8 color data only.
 * Authored levels take precedence; every gap is filtered from the preceding
 * level, up to 1x1. Float/data and GPU-writable textures retain their existing
 * single-level semantics. Explicitly allocated holes in those unsupported
 * cases are rejected instead of being presented as generated mip data.
 */
export function planNativeDataMipmaps(texture: NativeDataMipSource): NativeDataMipPlan | null {
  if (!texture.generateMipmaps || texture.source || texture.dimension !== "2d" || isCompressedTextureFormat(texture.format) ||
      !texture.usage.includes("sampled") || !texture.getMipLevel(0)) return null;
  const maxDimension = Math.max(texture.width, texture.height);
  if (!Number.isSafeInteger(texture.width) || !Number.isSafeInteger(texture.height) || maxDimension < 1) {
    throw new RenderDeviceError("Data mip generation requires safe positive dimensions", "WEBGPU_DATA_MIP_GENERATION_UNSUPPORTED");
  }
  const mipLevelCount = Math.floor(Math.log2(maxDimension)) + 1;
  let missing = false;
  let missingAllocated = false;
  let residentBytes = 0;
  let generatedBytes = 0;
  let width = texture.width;
  let height = texture.height;
  for (let mip = 0; mip < mipLevelCount; mip += 1) {
    const bytes = width * height * 4;
    residentBytes += bytes;
    const level = mip < texture.mipLevelCount ? texture.getMipLevel(mip) : null;
    if (!level) {
      missing = true;
      missingAllocated ||= mip < texture.mipLevelCount;
      generatedBytes += bytes;
    }
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
  if (!missing) return null;
  if (texture.format !== "rgba8" || texture.usage.includes("storage") || texture.usage.includes("render-attachment")) {
    if (missingAllocated) {
      throw new RenderDeviceError("Data mip generation only supports sampled, CPU-authored 2D RGBA8 textures", "WEBGPU_DATA_MIP_GENERATION_UNSUPPORTED", { label: texture.label, format: texture.format });
    }
    return null;
  }
  if (!Number.isSafeInteger(residentBytes) || !Number.isSafeInteger(generatedBytes) ||
      texture.width * texture.height > MAX_SOURCE_PIXELS || generatedBytes > MAX_GENERATED_BYTES) {
    throw new RenderDeviceError("Data mip generation exceeds the synchronous CPU work or temporary memory limit", "WEBGPU_DATA_MIP_GENERATION_LIMIT", { label: texture.label });
  }
  for (let mip = 0; mip < texture.mipLevelCount; mip += 1) {
    const level = texture.getMipLevel(mip);
    if (level) assertRgba8Level(level, Math.max(1, Math.floor(texture.width / 2 ** mip)), Math.max(1, Math.floor(texture.height / 2 ** mip)));
  }
  return { mipLevelCount, residentBytes };
}

export function assertRgba8Level(level: TextureMipLevel, width: number, height: number): void {
  if (level.width !== width || level.height !== height ||
      !(level.data instanceof Uint8Array || level.data instanceof Uint8ClampedArray) || level.data.byteLength !== width * height * 4) {
    throw new RenderDeviceError("Data mip generation requires correctly sized RGBA8 levels", "WEBGPU_DATA_MIP_GENERATION_UNSUPPORTED");
  }
}

let srgbToLinear: Float64Array | undefined;
function srgbDecodeTable(): Float64Array {
  return srgbToLinear ??= Float64Array.from({ length: 256 }, (_, byte) => {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
}

function encodeByte(linear: number, srgb: boolean): number {
  const value = Math.max(0, Math.min(1, linear));
  const encoded = srgb ? (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055) : value;
  return Math.round(Math.max(0, Math.min(1, encoded)) * 255);
}

/**
 * Area-filter pixel footprints, including fractional edge coverage for odd
 * dimensions. RGB is decoded to linear light and re-encoded for sRGB. RGBA
 * channels are averaged independently: alpha is linear and RGB is unassociated
 * (neither premultiplied nor alpha weighted). Each level rounds to RGBA8.
 */
export function filterNativeDataMip(previous: TextureMipLevel, colorSpace: Texture["colorSpace"]): TextureMipLevel {
  const sourceWidth = previous.width, sourceHeight = previous.height;
  assertRgba8Level(previous, sourceWidth, sourceHeight);
  const input = previous.data as Uint8Array | Uint8ClampedArray;
  const width = Math.max(1, Math.floor(sourceWidth / 2));
  const height = Math.max(1, Math.floor(sourceHeight / 2));
  const data = new Uint8Array(width * height * 4);
  const srgb = colorSpace === "srgb";
  const decode = srgb ? srgbDecodeTable() : undefined;
  for (let y = 0; y < height; y += 1) {
    const top = y * sourceHeight / height, bottom = (y + 1) * sourceHeight / height;
    for (let x = 0; x < width; x += 1) {
      const left = x * sourceWidth / width, right = (x + 1) * sourceWidth / width;
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy += 1) {
        const wy = Math.min(bottom, sy + 1) - Math.max(top, sy);
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx += 1) {
          const weight = wy * (Math.min(right, sx + 1) - Math.max(left, sx));
          const offset = (sy * sourceWidth + sx) * 4;
          const r = input[offset]!, g = input[offset + 1]!, b = input[offset + 2]!;
          red += weight * (decode?.[r] ?? r / 255);
          green += weight * (decode?.[g] ?? g / 255);
          blue += weight * (decode?.[b] ?? b / 255);
          alpha += weight * input[offset + 3]! / 255;
        }
      }
      const area = (right - left) * (bottom - top);
      const offset = (y * width + x) * 4;
      data[offset] = encodeByte(red / area, srgb);
      data[offset + 1] = encodeByte(green / area, srgb);
      data[offset + 2] = encodeByte(blue / area, srgb);
      data[offset + 3] = encodeByte(alpha / area, false);
    }
  }
  return { width, height, data };
}
