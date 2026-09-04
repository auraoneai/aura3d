export type TextureMagFilter = "nearest" | "linear";
export type TextureMinFilter =
  | TextureMagFilter
  | "nearest-mipmap-nearest"
  | "linear-mipmap-nearest"
  | "nearest-mipmap-linear"
  | "linear-mipmap-linear";
export type TextureFilter = TextureMinFilter;
export type TextureAddressMode = "clamp-to-edge" | "repeat" | "mirror-repeat";

export interface SamplerDescriptor {
  readonly minFilter?: TextureMinFilter;
  readonly magFilter?: TextureMagFilter;
  readonly addressU?: TextureAddressMode;
  readonly addressV?: TextureAddressMode;
  readonly maxAnisotropy?: number;
}

export class Sampler {
  public readonly minFilter: TextureMinFilter;
  public readonly magFilter: TextureMagFilter;
  public readonly addressU: TextureAddressMode;
  public readonly addressV: TextureAddressMode;
  public readonly maxAnisotropy: number;

  constructor(descriptor: SamplerDescriptor = {}) {
    this.minFilter = descriptor.minFilter ?? "linear";
    this.magFilter = descriptor.magFilter ?? "linear";
    this.addressU = descriptor.addressU ?? "clamp-to-edge";
    this.addressV = descriptor.addressV ?? "clamp-to-edge";
    const maxAnisotropy = descriptor.maxAnisotropy ?? 1;
    if (!Number.isFinite(maxAnisotropy) || maxAnisotropy < 1) {
      throw new RangeError("Sampler maxAnisotropy must be finite and at least 1");
    }
    this.maxAnisotropy = maxAnisotropy;
  }
}

/** Device-quantized sampler anisotropy steps (muse3jsparity-PRD C3). */
export const SAMPLER_ANISOTROPY_STEPS = [1, 2, 4, 8, 16] as const;

/**
 * C3 floor: root material builders request at least 8x where supported.
 * The renderer still clamps to the device maximum at upload time, so a
 * request above the device capability folds down instead of failing.
 */
export const DEFAULT_SAMPLER_ANISOTROPY = 8;

export interface SamplerAnisotropyRequest {
  /** Desired anisotropy. Defaults to {@link DEFAULT_SAMPLER_ANISOTROPY}. */
  readonly desired?: number;
  /**
   * Capability-probe result: maximum anisotropy the device supports.
   * When absent the request passes through at the desired level and the
   * renderer clamps to the device maximum at upload time.
   */
  readonly maxSupported?: number;
}

export interface SamplerAnisotropyResolution {
  readonly applied: number;
  readonly capped: boolean;
  readonly detail: string;
}

/**
 * C3 capability-gated anisotropy for root material builders. Snaps the
 * request down to a device-quantized step and, when the device capability
 * is known, caps it instead of failing.
 */
export function resolveSamplerAnisotropy(request: SamplerAnisotropyRequest = {}): SamplerAnisotropyResolution {
  const rawDesired = request.desired;
  const desired = typeof rawDesired === "number" && Number.isFinite(rawDesired) && rawDesired >= 1
    ? rawDesired
    : DEFAULT_SAMPLER_ANISOTROPY;
  const snappedDesired = snapAnisotropyStep(desired);
  const rawMax = request.maxSupported;
  if (typeof rawMax !== "number" || !Number.isFinite(rawMax)) {
    return {
      applied: snappedDesired,
      capped: false,
      detail: `Anisotropy ${snappedDesired}x requested; device capability unknown — the renderer clamps to the device maximum at upload time.`
    };
  }
  const maxSupported = Math.max(1, rawMax);
  const allowed = Math.min(desired, maxSupported);
  const applied = snapAnisotropyStep(allowed);
  const capped = applied < desired;
  return {
    applied,
    capped,
    detail: capped
      ? `Anisotropy ${desired}x requested but device supports ${maxSupported}x — applied ${applied}x.`
      : `Anisotropy ${applied}x applied (requested ${desired}x, device ${maxSupported}x).`
  };
}

function snapAnisotropyStep(value: number): number {
  let applied: number = SAMPLER_ANISOTROPY_STEPS[0]!;
  for (const step of SAMPLER_ANISOTROPY_STEPS) {
    if (step <= value) applied = step;
  }
  return applied;
}
